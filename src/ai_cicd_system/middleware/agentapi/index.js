/**
 * AgentAPI Middleware Integration - Consolidated Entry Point
 * 
 * This module provides a unified interface for all AgentAPI middleware functionality,
 * consolidating components from PRs #43, #46, #47, #60, #61, #76, #83, #84, #85, #92.
 * 
 * Features:
 * - Unified AgentAPI client with circuit breaker protection
 * - Centralized configuration management
 * - Express middleware stack (auth, rate limiting, CORS)
 * - Agent session management and health monitoring
 * - WSL2 deployment automation
 * - Real-time status updates via webhooks
 */

import { AgentAPIClient } from './client.js';
import { AgentConfigManager } from './config.js';
import { AgentMiddleware } from './middleware.js';
import { AgentManager } from './manager.js';
import { AgentHealthMonitor } from './health.js';
import { AgentRouter } from './router.js';
import { AgentEndpoints } from './endpoints.js';
import { WSL2Manager } from './wsl2.js';
import { WebhookHandler } from './webhooks.js';
import { AuthManager } from './auth.js';
import { SimpleLogger } from '../../utils/simple_logger.js';

/**
 * Main AgentAPI Integration class that orchestrates all middleware components
 */
export class AgentAPIIntegration {
  constructor(config = {}) {
    this.config = config;
    this.logger = new SimpleLogger('AgentAPIIntegration');
    
    // Initialize components
    this.configManager = new AgentConfigManager(config.configPath);
    this.healthMonitor = new AgentHealthMonitor(config.monitoring);
    this.authManager = new AuthManager(config.auth);
    this.agentRouter = new AgentRouter(config.routing, this.healthMonitor);
    this.agentManager = new AgentManager(config.agents, this.healthMonitor, this.agentRouter);
    this.wsl2Manager = new WSL2Manager(config.wsl2);
    this.webhookHandler = new WebhookHandler(config.webhooks);
    this.middleware = new AgentMiddleware(config.middleware, this.authManager);
    this.endpoints = new AgentEndpoints(config.api, {
      agentManager: this.agentManager,
      healthMonitor: this.healthMonitor,
      middleware: this.middleware,
      wsl2Manager: this.wsl2Manager
    });
    
    this.initialized = false;
    this.startTime = Date.now();
  }

  /**
   * Initialize all middleware components
   */
  async initialize() {
    if (this.initialized) {
      this.logger.warn('AgentAPI Integration already initialized');
      return;
    }

    this.logger.info('Initializing AgentAPI Integration...');

    try {
      // Initialize components in dependency order
      await this.configManager.initialize();
      await this.authManager.initialize();
      await this.healthMonitor.start();
      await this.agentManager.initialize();
      await this.wsl2Manager.initialize();
      await this.webhookHandler.start();
      
      this.initialized = true;
      this.logger.info('AgentAPI Integration initialized successfully');
      
      // Start health monitoring
      this._startHealthChecks();
      
    } catch (error) {
      this.logger.error('Failed to initialize AgentAPI Integration:', error);
      throw error;
    }
  }

  /**
   * Shutdown all components gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down AgentAPI Integration...');

    try {
      await this.webhookHandler.stop();
      await this.healthMonitor.stop();
      await this.agentManager.shutdown();
      await this.wsl2Manager.cleanup();
      
      this.initialized = false;
      this.logger.info('AgentAPI Integration shutdown complete');
      
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Execute a task using the appropriate agent
   */
  async executeTask(task, options = {}) {
    if (!this.initialized) {
      throw new Error('AgentAPI Integration not initialized');
    }

    this.logger.info(`Executing task: ${task.id || 'unknown'}`, {
      taskType: task.type,
      agentType: options.agentType
    });

    try {
      // Route task to appropriate agent
      const result = await this.agentManager.executeTask(task, options);
      
      this.logger.info(`Task completed: ${task.id}`, {
        success: result.success,
        agentType: result.agentType,
        duration: result.duration
      });

      return result;
      
    } catch (error) {
      this.logger.error(`Task failed: ${task.id}`, error);
      throw error;
    }
  }

  /**
   * Deploy PR to WSL2 environment
   */
  async deployPR(prData, options = {}) {
    if (!this.initialized) {
      throw new Error('AgentAPI Integration not initialized');
    }

    this.logger.info(`Deploying PR #${prData.number}`, {
      repository: prData.repository,
      branch: prData.branch
    });

    try {
      const deployment = await this.wsl2Manager.deployPR(prData, options);
      
      this.logger.info(`PR deployed: ${deployment.id}`, {
        workspace: deployment.workspace,
        status: deployment.status
      });

      return deployment;
      
    } catch (error) {
      this.logger.error(`PR deployment failed: ${prData.number}`, error);
      throw error;
    }
  }

  /**
   * Get system status and metrics
   */
  getStatus() {
    return {
      initialized: this.initialized,
      uptime: Date.now() - this.startTime,
      components: {
        configManager: this.configManager.getStatus(),
        healthMonitor: this.healthMonitor.getStatus(),
        agentManager: this.agentManager.getStatus(),
        wsl2Manager: this.wsl2Manager.getStatus(),
        webhookHandler: this.webhookHandler.getStatus()
      },
      metrics: this.healthMonitor.getMetrics()
    };
  }

  /**
   * Get Express router for API endpoints
   */
  getRouter() {
    return this.endpoints.getRouter();
  }

  /**
   * Start periodic health checks
   */
  _startHealthChecks() {
    const interval = this.config.healthCheckInterval || 30000;
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const status = this.getStatus();
        
        if (!status.components.agentManager.healthy) {
          this.logger.warn('Agent manager unhealthy, attempting recovery');
          await this.agentManager.recover();
        }
        
        if (!status.components.wsl2Manager.healthy) {
          this.logger.warn('WSL2 manager unhealthy, cleaning up resources');
          await this.wsl2Manager.cleanup();
        }
        
      } catch (error) {
        this.logger.error('Health check failed:', error);
      }
    }, interval);
  }
}

/**
 * Create and initialize AgentAPI Integration instance
 */
export async function createAgentAPIIntegration(config = {}) {
  const integration = new AgentAPIIntegration(config);
  await integration.initialize();
  return integration;
}

/**
 * Quick setup presets for different environments
 */
export const quickSetup = {
  development: () => createAgentAPIIntegration({
    configPath: './config/agentapi-dev.json',
    monitoring: { healthCheckInterval: 30000 },
    auth: { enableAuthentication: false },
    middleware: { enableRateLimit: false },
    wsl2: { maxInstances: 3 }
  }),

  production: () => createAgentAPIIntegration({
    configPath: './config/agentapi-prod.json',
    monitoring: { healthCheckInterval: 15000 },
    auth: { enableAuthentication: true },
    middleware: { enableRateLimit: true },
    wsl2: { maxInstances: 10 }
  }),

  testing: () => createAgentAPIIntegration({
    configPath: './config/agentapi-test.json',
    monitoring: { healthCheckInterval: 60000 },
    auth: { enableAuthentication: false },
    middleware: { enableRateLimit: false },
    wsl2: { maxInstances: 1 }
  })
};

// Export all components for individual use
export {
  AgentAPIClient,
  AgentConfigManager,
  AgentMiddleware,
  AgentManager,
  AgentHealthMonitor,
  AgentRouter,
  AgentEndpoints,
  WSL2Manager,
  WebhookHandler,
  AuthManager
};

export default AgentAPIIntegration;

