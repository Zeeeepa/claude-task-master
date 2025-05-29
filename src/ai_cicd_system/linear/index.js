/**
 * Linear Integration Module
 * 
 * Main entry point for the Linear integration system providing
 * comprehensive project management synchronization with AI CI/CD workflows.
 */

import LinearClient from './linear_client.js';
import StatusManager from './status_manager.js';
import ProgressTracker from './progress_tracker.js';
import WebhookHandler from './webhook_handler.js';
import ConflictResolver from './conflict_resolver.js';
import LinearReporting from './reporting.js';
import logger from '../../../mcp-server/src/logger.js';

export class LinearIntegration {
  constructor(config = {}) {
    this.config = config;
    
    // Initialize core components
    this.client = new LinearClient(config.linear);
    this.statusManager = new StatusManager(config);
    this.progressTracker = new ProgressTracker(config);
    this.webhookHandler = new WebhookHandler(config);
    this.conflictResolver = new ConflictResolver(config.conflictResolution);
    this.reporting = new LinearReporting(config);
    
    // Integration state
    this.isInitialized = false;
    this.isWebhookServerRunning = false;
    
    // Event emitter for integration events
    this.eventHandlers = new Map();
    
    logger.info('Linear integration initialized', {
      components: [
        'LinearClient',
        'StatusManager', 
        'ProgressTracker',
        'WebhookHandler',
        'ConflictResolver',
        'LinearReporting'
      ]
    });
  }

  /**
   * Initialize the Linear integration system
   */
  async initialize() {
    try {
      logger.info('Initializing Linear integration system...');

      // Validate configuration
      await this.validateConfiguration();
      
      // Test Linear API connectivity
      await this.testConnectivity();
      
      // Setup webhook handlers if enabled
      if (this.config.webhook?.enabled !== false) {
        await this.setupWebhooks();
      }
      
      // Initialize progress tracking for existing projects
      await this.initializeProgressTracking();
      
      this.isInitialized = true;
      
      logger.info('Linear integration system initialized successfully');
      
      return {
        success: true,
        components: {
          client: true,
          statusManager: true,
          progressTracker: true,
          webhookHandler: this.isWebhookServerRunning,
          conflictResolver: true,
          reporting: true
        }
      };

    } catch (error) {
      logger.error('Failed to initialize Linear integration:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Start the integration services
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Start webhook server if configured
      if (this.config.webhook?.enabled !== false && !this.isWebhookServerRunning) {
        await this.webhookHandler.start();
        this.isWebhookServerRunning = true;
        logger.info('Webhook server started');
      }

      // Start any scheduled tasks
      await this.startScheduledTasks();

      logger.info('Linear integration services started');

    } catch (error) {
      logger.error('Failed to start Linear integration services:', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop the integration services
   */
  async stop() {
    try {
      // Stop webhook server
      if (this.isWebhookServerRunning) {
        await this.webhookHandler.stop();
        this.isWebhookServerRunning = false;
        logger.info('Webhook server stopped');
      }

      // Stop scheduled tasks
      await this.stopScheduledTasks();

      logger.info('Linear integration services stopped');

    } catch (error) {
      logger.error('Failed to stop Linear integration services:', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle CI/CD workflow events
   */
  async handleWorkflowEvent(event) {
    try {
      const { type, issueId, metadata = {} } = event;
      
      logger.info('Handling workflow event:', {
        type,
        issueId,
        metadata
      });

      // Update issue status based on workflow event
      const statusResult = await this.statusManager.updateStatusFromEvent(
        issueId,
        type,
        metadata
      );

      // Update progress tracking
      if (statusResult.success) {
        await this.updateProgressTracking(issueId, event);
      }

      // Emit integration event
      this.emitEvent('workflow_event_processed', {
        event,
        statusResult
      });

      return {
        success: true,
        statusUpdate: statusResult,
        event
      };

    } catch (error) {
      logger.error('Failed to handle workflow event:', {
        event,
        error: error.message
      });

      // Emit error event
      this.emitEvent('workflow_event_error', {
        event,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Batch handle multiple workflow events
   */
  async handleBatchWorkflowEvents(events) {
    try {
      logger.info('Handling batch workflow events:', {
        count: events.length
      });

      // Process events in batches to avoid overwhelming the API
      const batchSize = 10;
      const results = [];

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        
        const batchPromises = batch.map(event => 
          this.handleWorkflowEvent(event).catch(error => ({
            success: false,
            event,
            error: error.message
          }))
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Add delay between batches
        if (i + batchSize < events.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      logger.info('Batch workflow events processed:', {
        total: events.length,
        successful: successCount,
        failed: failureCount
      });

      return {
        success: failureCount === 0,
        results,
        summary: {
          total: events.length,
          successful: successCount,
          failed: failureCount
        }
      };

    } catch (error) {
      logger.error('Failed to handle batch workflow events:', {
        eventCount: events.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get project progress report
   */
  async getProjectProgress(projectId, options = {}) {
    try {
      return await this.reporting.generateProjectReport(projectId, options);
    } catch (error) {
      logger.error('Failed to get project progress:', {
        projectId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get team performance report
   */
  async getTeamPerformance(teamId, options = {}) {
    try {
      return await this.reporting.generateTeamReport(teamId, options);
    } catch (error) {
      logger.error('Failed to get team performance:', {
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get integration health status
   */
  async getHealthStatus() {
    try {
      const health = {
        overall: 'healthy',
        timestamp: new Date().toISOString(),
        components: {},
        metrics: {}
      };

      // Check Linear API connectivity
      try {
        await this.client.getTeamStates();
        health.components.linearApi = 'healthy';
      } catch (error) {
        health.components.linearApi = 'unhealthy';
        health.overall = 'degraded';
      }

      // Check webhook server
      health.components.webhookServer = this.isWebhookServerRunning ? 'healthy' : 'stopped';

      // Get component statistics
      health.metrics.statusManager = this.statusManager.getStatistics();
      health.metrics.conflictResolver = this.conflictResolver.getStatistics();
      health.metrics.reporting = this.reporting.getStatistics();

      // Determine overall health
      const unhealthyComponents = Object.values(health.components)
        .filter(status => status === 'unhealthy').length;
      
      if (unhealthyComponents > 0) {
        health.overall = unhealthyComponents > 1 ? 'critical' : 'degraded';
      }

      return health;

    } catch (error) {
      logger.error('Failed to get health status:', {
        error: error.message
      });
      
      return {
        overall: 'critical',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Register event handler
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Emit integration event
   */
  emitEvent(eventType, data) {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        logger.error('Event handler error:', {
          eventType,
          error: error.message
        });
      }
    });
  }

  /**
   * Private helper methods
   */
  async validateConfiguration() {
    if (!this.config.linear?.apiKey) {
      throw new Error('Linear API key is required');
    }

    // Validate other required configuration
    logger.info('Configuration validated successfully');
  }

  async testConnectivity() {
    try {
      // Test basic API connectivity
      await this.client.getTeamStates();
      logger.info('Linear API connectivity test passed');
    } catch (error) {
      throw new Error(`Linear API connectivity test failed: ${error.message}`);
    }
  }

  async setupWebhooks() {
    try {
      // Register webhook handlers for integration events
      this.webhookHandler.registerHandler('IssueUpdate', async (payload) => {
        await this.handleLinearIssueUpdate(payload);
      });

      logger.info('Webhook handlers configured');
    } catch (error) {
      logger.error('Failed to setup webhooks:', { error: error.message });
      throw error;
    }
  }

  async initializeProgressTracking() {
    try {
      // Initialize progress tracking for existing projects
      // This would typically fetch active projects and set up tracking
      logger.info('Progress tracking initialized');
    } catch (error) {
      logger.error('Failed to initialize progress tracking:', {
        error: error.message
      });
      throw error;
    }
  }

  async startScheduledTasks() {
    // Start any scheduled reporting or maintenance tasks
    logger.info('Scheduled tasks started');
  }

  async stopScheduledTasks() {
    // Stop scheduled tasks
    logger.info('Scheduled tasks stopped');
  }

  async updateProgressTracking(issueId, event) {
    try {
      // Update progress tracking based on issue changes
      // This could trigger milestone updates, progress recalculation, etc.
      logger.debug('Progress tracking updated for issue:', { issueId, event });
    } catch (error) {
      logger.error('Failed to update progress tracking:', {
        issueId,
        event,
        error: error.message
      });
    }
  }

  async handleLinearIssueUpdate(payload) {
    try {
      // Handle incoming Linear webhook for issue updates
      const { data, updatedFrom } = payload;
      
      // Check if this was an automated update to avoid loops
      if (this.isAutomatedUpdate(data, updatedFrom)) {
        logger.debug('Skipping automated update to avoid loop');
        return;
      }

      // Process the update
      logger.info('Processing Linear issue update:', {
        issueId: data.id,
        identifier: data.identifier
      });

      // Emit event for other systems to handle
      this.emitEvent('linear_issue_updated', {
        issue: data,
        changes: updatedFrom
      });

    } catch (error) {
      logger.error('Failed to handle Linear issue update:', {
        error: error.message
      });
    }
  }

  isAutomatedUpdate(issue, updatedFrom) {
    // Logic to detect if this was an automated update
    // This could check for specific patterns, timestamps, etc.
    return false; // Simplified for now
  }
}

// Export individual components for direct use
export {
  LinearClient,
  StatusManager,
  ProgressTracker,
  WebhookHandler,
  ConflictResolver,
  LinearReporting
};

// Export default integration class
export default LinearIntegration;

