/**
 * @fileoverview Webhook System Entry Point
 * @description Main entry point for the GitHub webhook system
 */

import { GitHubWebhookServer } from './github_webhook_server.js';
import { PRAnalyzer } from './pr_analyzer.js';
import { StatusReporter } from './status_reporter.js';
import { ValidationPipeline } from './validation_pipeline.js';
import { CheckSuiteHandler } from './handlers/check_suite.js';
import { CodegenIntegration } from '../integrations/codegen_client.js';
import { webhookConfig } from './config.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Webhook System
 * Main class that orchestrates all webhook components
 */
export class WebhookSystem {
  constructor(config = {}) {
    this.config = {
      ...webhookConfig,
      ...config
    };

    this.server = null;
    this.components = {};
    this.isRunning = false;
  }

  /**
   * Initialize the webhook system
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      log('info', 'Initializing webhook system...');

      // Initialize core components
      this.components.codegenClient = new CodegenIntegration(this.config.codegen);
      this.components.prAnalyzer = new PRAnalyzer(this.config.github);
      this.components.statusReporter = new StatusReporter(this.config.github);
      
      this.components.validationPipeline = new ValidationPipeline({
        analyzer: this.components.prAnalyzer,
        codegenClient: this.components.codegenClient,
        statusReporter: this.components.statusReporter,
        ...this.config.validation
      });

      this.components.checkSuiteHandler = new CheckSuiteHandler({
        codegenClient: this.components.codegenClient,
        statusReporter: this.components.statusReporter,
        ...this.config.checkSuite
      });

      // Initialize main webhook server
      this.server = new GitHubWebhookServer({
        ...this.config,
        validationPipeline: this.components.validationPipeline,
        checkSuiteHandler: this.components.checkSuiteHandler
      });

      log('info', 'Webhook system initialized successfully');

    } catch (error) {
      log('error', 'Failed to initialize webhook system', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Start the webhook system
   * @returns {Promise<void>}
   */
  async start() {
    try {
      if (this.isRunning) {
        log('warn', 'Webhook system is already running');
        return;
      }

      if (!this.server) {
        await this.initialize();
      }

      await this.server.start();
      this.isRunning = true;

      log('info', 'Webhook system started successfully', {
        port: this.config.server.port,
        host: this.config.server.host
      });

      // Setup health monitoring
      this.startHealthMonitoring();

    } catch (error) {
      log('error', 'Failed to start webhook system', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop the webhook system
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      if (!this.isRunning) {
        log('warn', 'Webhook system is not running');
        return;
      }

      if (this.server) {
        await this.server.stop();
      }

      this.isRunning = false;

      log('info', 'Webhook system stopped successfully');

    } catch (error) {
      log('error', 'Failed to stop webhook system', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Restart the webhook system
   * @returns {Promise<void>}
   */
  async restart() {
    log('info', 'Restarting webhook system...');
    
    await this.stop();
    await this.start();
    
    log('info', 'Webhook system restarted successfully');
  }

  /**
   * Get system status
   * @returns {Object} System status
   */
  getStatus() {
    return {
      running: this.isRunning,
      components: {
        server: this.server ? 'initialized' : 'not_initialized',
        codegenClient: this.components.codegenClient ? 'initialized' : 'not_initialized',
        prAnalyzer: this.components.prAnalyzer ? 'initialized' : 'not_initialized',
        statusReporter: this.components.statusReporter ? 'initialized' : 'not_initialized',
        validationPipeline: this.components.validationPipeline ? 'initialized' : 'not_initialized',
        checkSuiteHandler: this.components.checkSuiteHandler ? 'initialized' : 'not_initialized'
      },
      config: {
        server_port: this.config.server.port,
        github_configured: !!this.config.github.token,
        codegen_configured: !!this.config.codegen.apiKey,
        webhook_secret_configured: !!this.config.github.webhookSecret
      },
      uptime: this.isRunning ? process.uptime() : 0
    };
  }

  /**
   * Get system health
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      components: {}
    };

    try {
      // Check Codegen client health
      if (this.components.codegenClient) {
        try {
          await this.components.codegenClient.getHealth();
          health.components.codegen = 'healthy';
        } catch (error) {
          health.components.codegen = 'unhealthy';
          health.status = 'degraded';
        }
      }

      // Check GitHub API health
      if (this.components.prAnalyzer) {
        try {
          await this.components.prAnalyzer.octokit.rest.meta.get();
          health.components.github = 'healthy';
        } catch (error) {
          health.components.github = 'unhealthy';
          health.status = 'degraded';
        }
      }

      // Check server health
      health.components.server = this.isRunning ? 'healthy' : 'stopped';

      return health;

    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Get system metrics
   * @returns {Object} System metrics
   */
  getMetrics() {
    const metrics = {
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    if (this.server) {
      metrics.server = this.server.metrics || {};
    }

    if (this.components.codegenClient) {
      metrics.codegen = this.components.codegenClient.getQueueStatus();
    }

    return metrics;
  }

  /**
   * Start health monitoring
   * @private
   */
  startHealthMonitoring() {
    if (!this.config.monitoring.enableMetrics) {
      return;
    }

    const interval = this.config.monitoring.healthCheckInterval || 30000;

    setInterval(async () => {
      try {
        const health = await this.getHealth();
        const metrics = this.getMetrics();

        log('info', 'Health check completed', {
          status: health.status,
          memory_usage: metrics.system.memory.heapUsed,
          uptime: metrics.system.uptime
        });

        // Alert on unhealthy status
        if (health.status !== 'ok') {
          log('warn', 'System health degraded', {
            status: health.status,
            components: health.components
          });
        }

      } catch (error) {
        log('error', 'Health monitoring error', {
          error: error.message
        });
      }
    }, interval);
  }

  /**
   * Validate configuration
   * @returns {Object} Validation results
   */
  validateConfig() {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Required configurations
    if (!this.config.github.token) {
      validation.errors.push('GitHub token is required');
      validation.valid = false;
    }

    if (!this.config.github.webhookSecret) {
      validation.warnings.push('GitHub webhook secret not configured - signature verification disabled');
    }

    if (!this.config.codegen.apiKey) {
      validation.warnings.push('Codegen API key not configured - some features may not work');
    }

    // Server configuration
    if (!this.config.server.port || this.config.server.port < 1 || this.config.server.port > 65535) {
      validation.errors.push('Invalid server port configuration');
      validation.valid = false;
    }

    return validation;
  }
}

/**
 * Create and start webhook system
 * @param {Object} config - Configuration options
 * @returns {Promise<WebhookSystem>} Webhook system instance
 */
export async function createWebhookSystem(config = {}) {
  const system = new WebhookSystem(config);
  await system.initialize();
  return system;
}

/**
 * Start webhook system with default configuration
 * @returns {Promise<WebhookSystem>} Running webhook system
 */
export async function startWebhookSystem() {
  const system = await createWebhookSystem();
  await system.start();
  return system;
}

// Export all components for individual use
export {
  GitHubWebhookServer,
  PRAnalyzer,
  StatusReporter,
  ValidationPipeline,
  CheckSuiteHandler,
  CodegenIntegration,
  webhookConfig
};

export default WebhookSystem;

