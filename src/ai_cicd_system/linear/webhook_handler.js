/**
 * Linear Webhook Handler
 * 
 * Handles bidirectional webhook communication with Linear for real-time
 * synchronization between Linear and the AI CI/CD system.
 */

import express from 'express';
import crypto from 'crypto';
import LinearClient from './linear_client.js';
import StatusManager from './status_manager.js';
import ProgressTracker from './progress_tracker.js';
import logger from '../../../mcp-server/src/logger.js';

export class WebhookHandler {
  constructor(config = {}) {
    this.config = config;
    this.linearClient = new LinearClient(config.linear);
    this.statusManager = new StatusManager(config);
    this.progressTracker = new ProgressTracker(config);
    
    // Webhook configuration
    this.webhookSecret = config.webhookSecret || process.env.LINEAR_WEBHOOK_SECRET;
    this.port = config.port || 3001;
    this.path = config.path || '/webhooks/linear';
    
    // Event handlers
    this.eventHandlers = new Map();
    this.setupDefaultHandlers();
    
    // Request tracking
    this.requestHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000;
    
    // Express app for webhook server
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Raw body parser for webhook signature verification
    this.app.use(this.path, express.raw({ type: 'application/json' }));
    
    // JSON parser for other routes
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Webhook request received:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        timestamp: new Date().toISOString()
      });
      next();
    });
  }

  /**
   * Setup webhook routes
   */
  setupRoutes() {
    // Main webhook endpoint
    this.app.post(this.path, this.handleWebhook.bind(this));
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        webhookPath: this.path
      });
    });
    
    // Webhook status endpoint
    this.app.get('/webhooks/status', (req, res) => {
      res.json({
        registeredHandlers: Array.from(this.eventHandlers.keys()),
        recentRequests: this.requestHistory.slice(-10),
        uptime: process.uptime()
      });
    });
  }

  /**
   * Setup default event handlers
   */
  setupDefaultHandlers() {
    // Issue events
    this.registerHandler('Issue', this.handleIssueEvent.bind(this));
    this.registerHandler('IssueUpdate', this.handleIssueUpdateEvent.bind(this));
    
    // Comment events
    this.registerHandler('Comment', this.handleCommentEvent.bind(this));
    
    // Project events
    this.registerHandler('Project', this.handleProjectEvent.bind(this));
    this.registerHandler('ProjectUpdate', this.handleProjectUpdateEvent.bind(this));
    
    // Cycle events
    this.registerHandler('Cycle', this.handleCycleEvent.bind(this));
    
    // Team events
    this.registerHandler('Team', this.handleTeamEvent.bind(this));
  }

  /**
   * Register event handler
   */
  registerHandler(eventType, handler) {
    this.eventHandlers.set(eventType, handler);
    logger.info('Webhook handler registered:', { eventType });
  }

  /**
   * Main webhook handler
   */
  async handleWebhook(req, res) {
    try {
      // Verify webhook signature
      if (!this.verifySignature(req)) {
        logger.warn('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const payload = JSON.parse(req.body);
      const eventType = payload.type;
      
      logger.info('Processing webhook event:', {
        type: eventType,
        action: payload.action,
        timestamp: payload.createdAt
      });

      // Record request
      this.recordRequest({
        type: eventType,
        action: payload.action,
        timestamp: new Date().toISOString(),
        success: false // Will be updated on successful processing
      });

      // Find and execute handler
      const handler = this.eventHandlers.get(eventType);
      if (!handler) {
        logger.warn('No handler found for event type:', { eventType });
        return res.status(200).json({ message: 'Event type not handled' });
      }

      // Execute handler
      const result = await handler(payload);
      
      // Update request record
      const lastRequest = this.requestHistory[this.requestHistory.length - 1];
      if (lastRequest) {
        lastRequest.success = true;
        lastRequest.result = result;
      }

      logger.info('Webhook event processed successfully:', {
        type: eventType,
        action: payload.action,
        result: result
      });

      res.status(200).json({
        message: 'Event processed successfully',
        result: result
      });

    } catch (error) {
      logger.error('Webhook processing failed:', {
        error: error.message,
        stack: error.stack
      });

      // Update request record with error
      const lastRequest = this.requestHistory[this.requestHistory.length - 1];
      if (lastRequest) {
        lastRequest.success = false;
        lastRequest.error = error.message;
      }

      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Verify webhook signature
   */
  verifySignature(req) {
    if (!this.webhookSecret) {
      logger.warn('Webhook secret not configured, skipping signature verification');
      return true; // Allow if no secret is configured
    }

    const signature = req.headers['linear-signature'];
    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(req.body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle issue events
   */
  async handleIssueEvent(payload) {
    const { action, data } = payload;
    const issue = data;

    switch (action) {
      case 'create':
        return this.handleIssueCreated(issue);
      case 'update':
        return this.handleIssueUpdated(issue);
      case 'remove':
        return this.handleIssueRemoved(issue);
      default:
        logger.info('Unhandled issue action:', { action });
        return { handled: false, action };
    }
  }

  /**
   * Handle issue update events
   */
  async handleIssueUpdateEvent(payload) {
    const { action, data, updatedFrom } = payload;
    const issue = data;

    // Check if status changed
    if (updatedFrom?.stateId && updatedFrom.stateId !== issue.stateId) {
      await this.handleStatusChange(issue, updatedFrom);
    }

    // Check if assignee changed
    if (updatedFrom?.assigneeId !== issue.assigneeId) {
      await this.handleAssigneeChange(issue, updatedFrom);
    }

    // Check if priority changed
    if (updatedFrom?.priority !== issue.priority) {
      await this.handlePriorityChange(issue, updatedFrom);
    }

    return {
      handled: true,
      changes: {
        status: updatedFrom?.stateId !== issue.stateId,
        assignee: updatedFrom?.assigneeId !== issue.assigneeId,
        priority: updatedFrom?.priority !== issue.priority
      }
    };
  }

  /**
   * Handle comment events
   */
  async handleCommentEvent(payload) {
    const { action, data } = payload;
    const comment = data;

    if (action === 'create') {
      // Check if comment contains CI/CD commands
      const commands = this.extractCICDCommands(comment.body);
      
      if (commands.length > 0) {
        return this.processCICDCommands(comment.issueId, commands);
      }
    }

    return { handled: true, commandsFound: 0 };
  }

  /**
   * Handle project events
   */
  async handleProjectEvent(payload) {
    const { action, data } = payload;
    const project = data;

    if (action === 'create') {
      // Setup progress tracking for new project
      await this.setupProjectTracking(project);
    }

    return { handled: true, action, projectId: project.id };
  }

  /**
   * Handle project update events
   */
  async handleProjectUpdateEvent(payload) {
    const { action, data } = payload;
    const project = data;

    // Update progress tracking configuration
    await this.updateProjectTracking(project);

    return { handled: true, action, projectId: project.id };
  }

  /**
   * Handle cycle events
   */
  async handleCycleEvent(payload) {
    const { action, data } = payload;
    const cycle = data;

    if (action === 'create') {
      // Setup milestone tracking for new cycle
      await this.setupCycleTracking(cycle);
    }

    return { handled: true, action, cycleId: cycle.id };
  }

  /**
   * Handle team events
   */
  async handleTeamEvent(payload) {
    const { action, data } = payload;
    const team = data;

    // Clear team state cache when team configuration changes
    if (action === 'update') {
      this.statusManager.clearCache();
    }

    return { handled: true, action, teamId: team.id };
  }

  /**
   * Handle issue created
   */
  async handleIssueCreated(issue) {
    logger.info('Issue created:', {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title
    });

    // Trigger CI/CD workflow if configured
    if (this.shouldTriggerWorkflow(issue)) {
      await this.triggerCICDWorkflow(issue);
    }

    return { handled: true, triggered: this.shouldTriggerWorkflow(issue) };
  }

  /**
   * Handle issue updated
   */
  async handleIssueUpdated(issue) {
    logger.info('Issue updated:', {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title
    });

    // Update progress tracking
    await this.updateProgressTracking(issue);

    return { handled: true };
  }

  /**
   * Handle issue removed
   */
  async handleIssueRemoved(issue) {
    logger.info('Issue removed:', {
      id: issue.id,
      identifier: issue.identifier
    });

    // Clean up any associated CI/CD resources
    await this.cleanupCICDResources(issue);

    return { handled: true };
  }

  /**
   * Handle status change
   */
  async handleStatusChange(issue, updatedFrom) {
    logger.info('Issue status changed:', {
      issueId: issue.id,
      identifier: issue.identifier,
      fromState: updatedFrom.stateId,
      toState: issue.stateId
    });

    // Trigger appropriate CI/CD actions based on status change
    await this.handleStatusBasedActions(issue, updatedFrom);

    return { handled: true };
  }

  /**
   * Handle assignee change
   */
  async handleAssigneeChange(issue, updatedFrom) {
    logger.info('Issue assignee changed:', {
      issueId: issue.id,
      identifier: issue.identifier,
      fromAssignee: updatedFrom.assigneeId,
      toAssignee: issue.assigneeId
    });

    // Notify new assignee if configured
    await this.notifyAssigneeChange(issue, updatedFrom);

    return { handled: true };
  }

  /**
   * Handle priority change
   */
  async handlePriorityChange(issue, updatedFrom) {
    logger.info('Issue priority changed:', {
      issueId: issue.id,
      identifier: issue.identifier,
      fromPriority: updatedFrom.priority,
      toPriority: issue.priority
    });

    // Adjust CI/CD pipeline priority if needed
    await this.adjustPipelinePriority(issue, updatedFrom);

    return { handled: true };
  }

  /**
   * Extract CI/CD commands from comment text
   */
  extractCICDCommands(commentBody) {
    const commands = [];
    const commandPatterns = [
      /\/deploy\s+(\w+)/g,
      /\/test\s+(\w+)/g,
      /\/build/g,
      /\/restart/g,
      /\/rollback/g
    ];

    commandPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(commentBody)) !== null) {
        commands.push({
          command: match[0],
          args: match.slice(1)
        });
      }
    });

    return commands;
  }

  /**
   * Process CI/CD commands
   */
  async processCICDCommands(issueId, commands) {
    const results = [];

    for (const command of commands) {
      try {
        const result = await this.executeCICDCommand(issueId, command);
        results.push({ command: command.command, success: true, result });
      } catch (error) {
        logger.error('Failed to execute CI/CD command:', {
          issueId,
          command: command.command,
          error: error.message
        });
        results.push({ command: command.command, success: false, error: error.message });
      }
    }

    return { handled: true, commands: results };
  }

  /**
   * Execute CI/CD command
   */
  async executeCICDCommand(issueId, command) {
    // This would integrate with your CI/CD system
    // For now, just log the command
    logger.info('Executing CI/CD command:', {
      issueId,
      command: command.command,
      args: command.args
    });

    // Add comment to issue about command execution
    await this.linearClient.addComment(
      issueId,
      `🤖 **CI/CD Command Executed**: \`${command.command}\`\n\nCommand has been queued for execution.`
    );

    return { queued: true, command: command.command };
  }

  /**
   * Setup project tracking
   */
  async setupProjectTracking(project) {
    const milestoneConfig = {
      name: project.name,
      projectId: project.id,
      targetDate: project.targetDate,
      filters: {
        project: { id: project.id }
      }
    };

    await this.progressTracker.trackMilestone(project.id, milestoneConfig);
    logger.info('Project tracking setup:', { projectId: project.id, name: project.name });
  }

  /**
   * Setup cycle tracking
   */
  async setupCycleTracking(cycle) {
    const milestoneConfig = {
      name: `${cycle.name} (Cycle ${cycle.number})`,
      projectId: cycle.id,
      targetDate: cycle.endsAt,
      filters: {
        cycle: { id: cycle.id }
      }
    };

    await this.progressTracker.trackMilestone(cycle.id, milestoneConfig);
    logger.info('Cycle tracking setup:', { cycleId: cycle.id, name: cycle.name });
  }

  /**
   * Helper methods
   */
  shouldTriggerWorkflow(issue) {
    // Define conditions for triggering CI/CD workflow
    return issue.labels?.some(label => label.name === 'auto-deploy') ||
           issue.description?.includes('[auto-deploy]');
  }

  async triggerCICDWorkflow(issue) {
    // Integrate with your CI/CD system
    logger.info('Triggering CI/CD workflow for issue:', {
      issueId: issue.id,
      identifier: issue.identifier
    });
  }

  async updateProgressTracking(issue) {
    // Update progress tracking for the issue's project/cycle
    if (issue.projectId) {
      await this.progressTracker.trackMilestone(issue.projectId, {
        name: 'Project Progress',
        projectId: issue.projectId,
        filters: { project: { id: issue.projectId } }
      });
    }
  }

  async cleanupCICDResources(issue) {
    // Clean up any CI/CD resources associated with the issue
    logger.info('Cleaning up CI/CD resources for issue:', {
      issueId: issue.id,
      identifier: issue.identifier
    });
  }

  async handleStatusBasedActions(issue, updatedFrom) {
    // Implement status-based CI/CD actions
    const currentState = issue.state;
    
    if (currentState.type === 'in_progress') {
      // Issue moved to in progress - could trigger development environment setup
    } else if (currentState.type === 'in_review') {
      // Issue moved to review - could trigger PR creation or review request
    } else if (currentState.type === 'done') {
      // Issue completed - could trigger deployment
    }
  }

  async notifyAssigneeChange(issue, updatedFrom) {
    // Implement assignee change notifications
    logger.info('Notifying assignee change:', {
      issueId: issue.id,
      newAssignee: issue.assigneeId
    });
  }

  async adjustPipelinePriority(issue, updatedFrom) {
    // Implement pipeline priority adjustment
    logger.info('Adjusting pipeline priority:', {
      issueId: issue.id,
      newPriority: issue.priority
    });
  }

  recordRequest(request) {
    this.requestHistory.push(request);
    
    // Maintain history size limit
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }
  }

  /**
   * Start webhook server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info('Webhook server started:', {
            port: this.port,
            path: this.path,
            handlers: Array.from(this.eventHandlers.keys())
          });
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop webhook server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Webhook server stopped');
          resolve();
        });
      });
    }
  }
}

export default WebhookHandler;

