/**
 * Webhook System Main Entry Point
 * 
 * Main entry point for the comprehensive GitHub webhook system
 * that handles PR events and routes them to appropriate components.
 */

import { WebhookServer } from './webhook-server.js';
import { WebhookProcessor } from './webhook-processor.js';
import { EventRouter } from './event-router.js';
import { EventQueue } from './queue.js';
import { WebhookConfig, createDefaultConfig, validateEnvironment } from './config.js';
import { logger } from '../utils/logger.js';

export class WebhookSystem {
  constructor(config = {}) {
    // Initialize configuration
    this.config = config instanceof WebhookConfig ? config : createDefaultConfig(config);
    
    // Initialize components
    this.server = null;
    this.processor = null;
    this.router = null;
    this.queue = null;
    
    this.isRunning = false;
    this.startTime = null;
  }

  /**
   * Initialize the webhook system
   */
  async initialize() {
    try {
      logger.info('Initializing webhook system', {
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });

      // Validate environment
      validateEnvironment();

      // Initialize components
      this.processor = new WebhookProcessor(this.config.getAll());
      this.router = new EventRouter(this.config.getAll());
      this.queue = this.config.get('queue.enabled') ? new EventQueue(this.config.getAll()) : null;
      this.server = new WebhookServer(this.config.getAll());

      // Connect queue to router if enabled
      if (this.queue) {
        this.queue.on('processEvent', async (event, callback) => {
          try {
            await this.router.routeEvent(event);
            callback(null, { success: true });
          } catch (error) {
            callback(error);
          }
        });
      }

      logger.info('Webhook system initialized successfully', {
        components: {
          server: !!this.server,
          processor: !!this.processor,
          router: !!this.router,
          queue: !!this.queue
        }
      });

    } catch (error) {
      logger.error('Failed to initialize webhook system', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Start the webhook system
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Webhook system is already running');
      return;
    }

    try {
      logger.info('Starting webhook system');

      // Initialize if not already done
      if (!this.server) {
        await this.initialize();
      }

      // Start queue processing if enabled
      if (this.queue) {
        this.queue.startProcessing();
      }

      // Start webhook server
      await this.server.start();

      this.isRunning = true;
      this.startTime = new Date();

      logger.info('Webhook system started successfully', {
        port: this.config.get('server.port'),
        host: this.config.get('server.host'),
        queueEnabled: !!this.queue
      });

    } catch (error) {
      logger.error('Failed to start webhook system', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Stop the webhook system
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Webhook system is not running');
      return;
    }

    try {
      logger.info('Stopping webhook system');

      // Stop queue processing
      if (this.queue) {
        await this.queue.stopProcessing();
      }

      // Stop webhook server
      if (this.server) {
        await this.server.stop();
      }

      this.isRunning = false;

      const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
      logger.info('Webhook system stopped successfully', {
        uptime: `${Math.floor(uptime / 1000)}s`
      });

    } catch (error) {
      logger.error('Failed to stop webhook system', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Restart the webhook system
   */
  async restart() {
    logger.info('Restarting webhook system');
    
    await this.stop();
    await this.start();
    
    logger.info('Webhook system restarted successfully');
  }

  /**
   * Get system status
   */
  getStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    
    return {
      running: this.isRunning,
      uptime: `${Math.floor(uptime / 1000)}s`,
      startTime: this.startTime?.toISOString(),
      components: {
        server: this.server?.getStatus() || null,
        processor: this.processor?.getStatus() || null,
        router: this.router?.getStatus() || null,
        queue: this.queue?.getStatus() || null
      },
      config: this.config.getSanitized()
    };
  }

  /**
   * Get system health
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // Check server health
      if (this.server) {
        health.checks.server = { healthy: this.isRunning };
      }

      // Check queue health
      if (this.queue) {
        const queueStatus = this.queue.getStatus();
        health.checks.queue = {
          healthy: queueStatus.isProcessing && !queueStatus.paused,
          activeWorkers: queueStatus.activeWorkers,
          pendingItems: queueStatus.queues.pending
        };
      }

      // Check handler health
      if (this.router) {
        const handlers = this.router.handlers;
        health.checks.handlers = {};

        for (const [name, handler] of Object.entries(handlers)) {
          if (handler.healthCheck) {
            try {
              health.checks.handlers[name] = await handler.healthCheck();
            } catch (error) {
              health.checks.handlers[name] = {
                healthy: false,
                error: error.message
              };
            }
          } else {
            health.checks.handlers[name] = { healthy: true };
          }
        }
      }

      // Determine overall health
      const allChecks = Object.values(health.checks).flat();
      const unhealthyChecks = allChecks.filter(check => 
        typeof check === 'object' && check.healthy === false
      );

      if (unhealthyChecks.length > 0) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Get system metrics
   */
  getMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        pid: process.pid
      }
    };

    // Add component metrics
    if (this.processor) {
      metrics.processor = this.processor.getStatus();
    }

    if (this.router) {
      metrics.router = this.router.getStatus();
    }

    if (this.queue) {
      metrics.queue = this.queue.getMetrics();
    }

    if (this.server) {
      metrics.server = this.server.getStatus();
    }

    return metrics;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    try {
      // Merge with existing config
      const updatedConfig = this.config.mergeDeep(this.config.getAll(), newConfig);
      this.config = new WebhookConfig(updatedConfig);

      logger.info('Configuration updated successfully');

      // Note: Some config changes may require restart
      return {
        success: true,
        message: 'Configuration updated. Some changes may require restart.',
        requiresRestart: this.requiresRestart(newConfig)
      };

    } catch (error) {
      logger.error('Failed to update configuration', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if configuration changes require restart
   */
  requiresRestart(newConfig) {
    const restartRequiredKeys = [
      'server.port',
      'server.host',
      'security.secret',
      'queue.enabled'
    ];

    return restartRequiredKeys.some(key => {
      const newValue = this.getNestedValue(newConfig, key);
      const currentValue = this.config.get(key);
      return newValue !== undefined && newValue !== currentValue;
    });
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }
}

/**
 * Create and start webhook system with default configuration
 */
export async function createWebhookSystem(config = {}) {
  const system = new WebhookSystem(config);
  await system.initialize();
  return system;
}

/**
 * Start webhook system with configuration
 */
export async function startWebhookSystem(config = {}) {
  const system = new WebhookSystem(config);
  await system.start();
  return system;
}

// Export all components
export {
  WebhookServer,
  WebhookProcessor,
  EventRouter,
  EventQueue,
  WebhookConfig,
  createDefaultConfig,
  validateEnvironment
};

// Export handlers
export { ClaudeCodeHandler } from './handlers/claude-code-handler.js';
export { AgentAPIHandler } from './handlers/agentapi-handler.js';
export { CodegenHandler } from './handlers/codegen-handler.js';
export { LinearHandler } from './handlers/linear-handler.js';

export default WebhookSystem;

