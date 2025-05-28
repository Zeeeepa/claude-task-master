/**
 * Event Router
 * 
 * Intelligent routing system for different webhook event types,
 * dispatching events to appropriate handlers based on event type and configuration.
 */

import { ClaudeCodeHandler } from './handlers/claude-code-handler.js';
import { AgentAPIHandler } from './handlers/agentapi-handler.js';
import { CodegenHandler } from './handlers/codegen-handler.js';
import { LinearHandler } from './handlers/linear-handler.js';
import { logger } from '../utils/logger.js';

export class EventRouter {
  constructor(config = {}) {
    this.config = {
      enableClaudeCode: config.enableClaudeCode !== false,
      enableAgentAPI: config.enableAgentAPI !== false,
      enableCodegen: config.enableCodegen !== false,
      enableLinear: config.enableLinear !== false,
      parallelProcessing: config.parallelProcessing !== false,
      ...config
    };

    // Initialize handlers
    this.handlers = this.initializeHandlers();
    
    // Event routing rules
    this.routingRules = this.setupRoutingRules();
    
    this.stats = {
      routed: 0,
      failed: 0,
      handlerStats: {}
    };
  }

  /**
   * Initialize event handlers
   */
  initializeHandlers() {
    const handlers = {};

    if (this.config.enableClaudeCode) {
      handlers.claudeCode = new ClaudeCodeHandler(this.config);
    }

    if (this.config.enableAgentAPI) {
      handlers.agentAPI = new AgentAPIHandler(this.config);
    }

    if (this.config.enableCodegen) {
      handlers.codegen = new CodegenHandler(this.config);
    }

    if (this.config.enableLinear) {
      handlers.linear = new LinearHandler(this.config);
    }

    logger.info('Event handlers initialized', {
      handlers: Object.keys(handlers)
    });

    return handlers;
  }

  /**
   * Setup routing rules for different event types
   */
  setupRoutingRules() {
    return {
      // Pull Request Events
      'pull_request.opened': [
        { handler: 'claudeCode', action: 'deployPR', priority: 1 },
        { handler: 'agentAPI', action: 'notifyPRCreated', priority: 2 },
        { handler: 'linear', action: 'updateIssueStatus', priority: 3 }
      ],
      
      'pull_request.synchronize': [
        { handler: 'claudeCode', action: 'updateDeployment', priority: 1 },
        { handler: 'agentAPI', action: 'notifyPRUpdated', priority: 2 },
        { handler: 'linear', action: 'updateIssueProgress', priority: 3 }
      ],
      
      'pull_request.closed': [
        { handler: 'claudeCode', action: 'cleanupDeployment', priority: 1 },
        { handler: 'linear', action: 'updateIssueCompletion', priority: 2 }
      ],
      
      'pull_request.reopened': [
        { handler: 'claudeCode', action: 'redeployPR', priority: 1 },
        { handler: 'agentAPI', action: 'notifyPRReopened', priority: 2 },
        { handler: 'linear', action: 'updateIssueReopened', priority: 3 }
      ],

      // Push Events
      'push': [
        { handler: 'agentAPI', action: 'notifyPush', priority: 1 },
        { handler: 'linear', action: 'updateBranchStatus', priority: 2 }
      ],

      // Workflow Events
      'workflow_run.completed': [
        { handler: 'claudeCode', action: 'handleWorkflowResult', priority: 1 },
        { handler: 'agentAPI', action: 'notifyWorkflowCompleted', priority: 2 },
        { handler: 'linear', action: 'updateWorkflowStatus', priority: 3 }
      ],

      'workflow_run.failed': [
        { handler: 'codegen', action: 'handleWorkflowFailure', priority: 1 },
        { handler: 'linear', action: 'updateFailureStatus', priority: 2 }
      ],

      // Issue Events
      'issues.opened': [
        { handler: 'linear', action: 'syncIssueCreated', priority: 1 }
      ],

      'issues.closed': [
        { handler: 'linear', action: 'syncIssueClosed', priority: 1 }
      ],

      // Comment Events
      'issue_comment.created': [
        { handler: 'agentAPI', action: 'processComment', priority: 1 },
        { handler: 'linear', action: 'syncComment', priority: 2 }
      ],

      // Pull Request Review Events
      'pull_request_review.submitted': [
        { handler: 'agentAPI', action: 'processReview', priority: 1 },
        { handler: 'linear', action: 'updateReviewStatus', priority: 2 }
      ]
    };
  }

  /**
   * Route event to appropriate handlers
   */
  async routeEvent(event) {
    const startTime = Date.now();
    
    try {
      logger.info('Routing event', {
        eventId: event.id,
        eventType: event.eventType,
        repository: event.repository?.fullName
      });

      // Get routing rules for this event type
      const rules = this.routingRules[event.eventType] || [];
      
      if (rules.length === 0) {
        logger.warn('No routing rules found for event type', {
          eventId: event.id,
          eventType: event.eventType
        });
        return;
      }

      // Filter rules based on available handlers
      const applicableRules = rules.filter(rule => 
        this.handlers[rule.handler] && this.isHandlerEnabled(rule.handler)
      );

      if (applicableRules.length === 0) {
        logger.warn('No applicable handlers for event', {
          eventId: event.id,
          eventType: event.eventType,
          availableHandlers: Object.keys(this.handlers)
        });
        return;
      }

      // Sort by priority
      applicableRules.sort((a, b) => a.priority - b.priority);

      // Process handlers
      if (this.config.parallelProcessing) {
        await this.processHandlersParallel(event, applicableRules);
      } else {
        await this.processHandlersSequential(event, applicableRules);
      }

      this.stats.routed++;
      
      const duration = Date.now() - startTime;
      logger.info('Event routed successfully', {
        eventId: event.id,
        handlersInvoked: applicableRules.length,
        duration: `${duration}ms`
      });

    } catch (error) {
      this.stats.failed++;
      
      logger.error('Event routing failed', {
        eventId: event.id,
        eventType: event.eventType,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Process handlers in parallel
   */
  async processHandlersParallel(event, rules) {
    const promises = rules.map(async (rule) => {
      try {
        await this.invokeHandler(event, rule);
        this.updateHandlerStats(rule.handler, 'success');
      } catch (error) {
        this.updateHandlerStats(rule.handler, 'failure');
        logger.error('Handler failed in parallel processing', {
          eventId: event.id,
          handler: rule.handler,
          action: rule.action,
          error: error.message
        });
        // Don't throw in parallel mode - let other handlers continue
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Process handlers sequentially
   */
  async processHandlersSequential(event, rules) {
    for (const rule of rules) {
      try {
        await this.invokeHandler(event, rule);
        this.updateHandlerStats(rule.handler, 'success');
        
      } catch (error) {
        this.updateHandlerStats(rule.handler, 'failure');
        
        logger.error('Handler failed in sequential processing', {
          eventId: event.id,
          handler: rule.handler,
          action: rule.action,
          error: error.message
        });

        // In sequential mode, decide whether to continue or fail
        if (this.shouldStopOnHandlerFailure(rule, error)) {
          throw error;
        }
      }
    }
  }

  /**
   * Invoke a specific handler
   */
  async invokeHandler(event, rule) {
    const handler = this.handlers[rule.handler];
    
    if (!handler) {
      throw new Error(`Handler not found: ${rule.handler}`);
    }

    if (!handler[rule.action]) {
      throw new Error(`Action not found: ${rule.action} on handler ${rule.handler}`);
    }

    logger.debug('Invoking handler', {
      eventId: event.id,
      handler: rule.handler,
      action: rule.action
    });

    const startTime = Date.now();
    
    try {
      const result = await handler[rule.action](event);
      
      const duration = Date.now() - startTime;
      logger.debug('Handler invoked successfully', {
        eventId: event.id,
        handler: rule.handler,
        action: rule.action,
        duration: `${duration}ms`
      });

      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Handler invocation failed', {
        eventId: event.id,
        handler: rule.handler,
        action: rule.action,
        duration: `${duration}ms`,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Check if handler is enabled
   */
  isHandlerEnabled(handlerName) {
    const enabledMap = {
      claudeCode: this.config.enableClaudeCode,
      agentAPI: this.config.enableAgentAPI,
      codegen: this.config.enableCodegen,
      linear: this.config.enableLinear
    };

    return enabledMap[handlerName] !== false;
  }

  /**
   * Determine if processing should stop on handler failure
   */
  shouldStopOnHandlerFailure(rule, error) {
    // Critical handlers that should stop processing on failure
    const criticalHandlers = ['claudeCode'];
    
    // Critical actions that should stop processing on failure
    const criticalActions = ['deployPR', 'updateDeployment'];

    return criticalHandlers.includes(rule.handler) || 
           criticalActions.includes(rule.action);
  }

  /**
   * Update handler statistics
   */
  updateHandlerStats(handlerName, result) {
    if (!this.stats.handlerStats[handlerName]) {
      this.stats.handlerStats[handlerName] = {
        success: 0,
        failure: 0
      };
    }

    this.stats.handlerStats[handlerName][result]++;
  }

  /**
   * Add custom routing rule
   */
  addRoutingRule(eventType, rule) {
    if (!this.routingRules[eventType]) {
      this.routingRules[eventType] = [];
    }

    this.routingRules[eventType].push(rule);
    
    // Sort by priority
    this.routingRules[eventType].sort((a, b) => a.priority - b.priority);

    logger.info('Custom routing rule added', {
      eventType,
      handler: rule.handler,
      action: rule.action,
      priority: rule.priority
    });
  }

  /**
   * Remove routing rule
   */
  removeRoutingRule(eventType, handlerName, actionName) {
    if (!this.routingRules[eventType]) {
      return false;
    }

    const initialLength = this.routingRules[eventType].length;
    this.routingRules[eventType] = this.routingRules[eventType].filter(
      rule => !(rule.handler === handlerName && rule.action === actionName)
    );

    const removed = this.routingRules[eventType].length < initialLength;
    
    if (removed) {
      logger.info('Routing rule removed', {
        eventType,
        handler: handlerName,
        action: actionName
      });
    }

    return removed;
  }

  /**
   * Get router status
   */
  getStatus() {
    return {
      stats: this.stats,
      handlers: Object.keys(this.handlers),
      routingRules: Object.keys(this.routingRules).reduce((acc, eventType) => {
        acc[eventType] = this.routingRules[eventType].length;
        return acc;
      }, {}),
      config: {
        parallelProcessing: this.config.parallelProcessing,
        enabledHandlers: Object.keys(this.handlers).filter(h => this.isHandlerEnabled(h))
      }
    };
  }
}

export default EventRouter;

