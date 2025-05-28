/**
 * AgentAPI Middleware Integration - Main Entry Point
 * 
 * This module provides the main entry point for the AgentAPI middleware
 * integration system. It exports all components and provides a unified
 * interface for initializing and managing the middleware layer.
 * 
 * Features:
 * - Unified initialization and configuration
 * - Component lifecycle management
 * - Event coordination between components
 * - Health monitoring and metrics aggregation
 * - Graceful shutdown handling
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../utils/simple_logger.js';
import AgentAPIClient from './agentapi_client.js';
import WSL2Manager from './wsl2_manager.js';
import ClaudeCodeIntegration from './claude_code_integration.js';
import AgentSessionManager from './agent_session_manager.js';

// Export individual components
export { AgentAPIClient };
export { WSL2Manager };
export { ClaudeCodeIntegration };
export { AgentSessionManager };

/**
 * AgentAPI Middleware System
 * 
 * Main orchestrator class that manages all middleware components
 * and provides a unified interface for the AI CI/CD system.
 */
export class AgentAPIMiddleware extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      logLevel: config.logLevel || 'info',
      enableHealthMonitoring: config.enableHealthMonitoring !== false,
      healthCheckInterval: config.healthCheckInterval || 60000,
      enableMetrics: config.enableMetrics !== false,
      metricsInterval: config.metricsInterval || 30000,
      gracefulShutdownTimeout: config.gracefulShutdownTimeout || 30000,
      ...config
    };

    this.logger = new SimpleLogger('AgentAPIMiddleware', this.config.logLevel);
    
    // Component instances
    this.agentAPI = null;
    this.wsl2Manager = null;
    this.claudeCodeIntegration = null;
    this.sessionManager = null;
    
    // System state
    this.isInitialized = false;
    this.isShuttingDown = false;
    this.healthCheckTimer = null;
    this.metricsTimer = null;
    
    // Metrics aggregation
    this.systemMetrics = {
      startTime: Date.now(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      activeSessions: 0,
      activeInstances: 0,
      activeDeployments: 0,
      lastHealthCheck: null,
      componentHealth: {}
    };
  }

  /**
   * Initialize the middleware system
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('Middleware system is already initialized');
      return;
    }

    try {
      this.logger.info('Initializing AgentAPI Middleware System');
      
      // Initialize components in dependency order
      await this.initializeComponents();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Start monitoring
      this.startMonitoring();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      this.isInitialized = true;
      this.logger.info('AgentAPI Middleware System initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize middleware system:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Initialize all components
   */
  async initializeComponents() {
    // Initialize AgentAPI Client
    this.logger.debug('Initializing AgentAPI Client');
    this.agentAPI = new AgentAPIClient(this.config.agentapi);
    
    // Initialize WSL2 Manager
    this.logger.debug('Initializing WSL2 Manager');
    this.wsl2Manager = new WSL2Manager(this.config.wsl2);
    
    // Initialize Session Manager
    this.logger.debug('Initializing Agent Session Manager');
    this.sessionManager = new AgentSessionManager({
      ...this.config.sessionManager,
      agentapi: this.config.agentapi
    });
    
    // Initialize Claude Code Integration
    this.logger.debug('Initializing Claude Code Integration');
    this.claudeCodeIntegration = new ClaudeCodeIntegration({
      agentapi: this.config.agentapi,
      wsl2: this.config.wsl2,
      claudeCode: this.config.claudeCode,
      validation: this.config.validation
    });
    
    // Wait for all components to initialize
    await Promise.all([
      this.wsl2Manager.initialize(),
      this.sessionManager.initialize()
    ]);
  }

  /**
   * Setup event handlers for component coordination
   */
  setupEventHandlers() {
    // AgentAPI Client events
    this.agentAPI.on('circuitBreakerOpened', (data) => {
      this.logger.warn('AgentAPI circuit breaker opened:', data);
      this.emit('componentAlert', { component: 'agentapi', type: 'circuit_breaker_open', data });
    });

    this.agentAPI.on('healthCheckFailure', (error) => {
      this.logger.warn('AgentAPI health check failed:', error.message);
      this.systemMetrics.componentHealth.agentapi = false;
    });

    this.agentAPI.on('healthCheckSuccess', () => {
      this.systemMetrics.componentHealth.agentapi = true;
    });

    // WSL2 Manager events
    this.wsl2Manager.on('instanceCreated', (instance) => {
      this.logger.info(`WSL2 instance created: ${instance.id}`);
      this.systemMetrics.activeInstances++;
      this.emit('instanceCreated', instance);
    });

    this.wsl2Manager.on('instanceDestroyed', (data) => {
      this.logger.info(`WSL2 instance destroyed: ${data.instanceId}`);
      this.systemMetrics.activeInstances = Math.max(0, this.systemMetrics.activeInstances - 1);
      this.emit('instanceDestroyed', data);
    });

    // Session Manager events
    this.sessionManager.on('sessionCreated', (session) => {
      this.logger.info(`Agent session created: ${session.id} (${session.type})`);
      this.systemMetrics.activeSessions++;
      this.emit('sessionCreated', session);
    });

    this.sessionManager.on('sessionStopped', (data) => {
      this.logger.info(`Agent session stopped: ${data.sessionId}`);
      this.systemMetrics.activeSessions = Math.max(0, this.systemMetrics.activeSessions - 1);
      this.emit('sessionStopped', data);
    });

    // Claude Code Integration events
    this.claudeCodeIntegration.on('deploymentStarted', (deployment) => {
      this.logger.info(`PR deployment started: ${deployment.id}`);
      this.systemMetrics.activeDeployments++;
      this.systemMetrics.totalRequests++;
      this.emit('deploymentStarted', deployment);
    });

    this.claudeCodeIntegration.on('deploymentCompleted', (deployment) => {
      this.logger.info(`PR deployment completed: ${deployment.id}`);
      this.systemMetrics.activeDeployments = Math.max(0, this.systemMetrics.activeDeployments - 1);
      this.systemMetrics.successfulRequests++;
      this.emit('deploymentCompleted', deployment);
    });

    this.claudeCodeIntegration.on('deploymentFailed', (deployment) => {
      this.logger.error(`PR deployment failed: ${deployment.id}`);
      this.systemMetrics.activeDeployments = Math.max(0, this.systemMetrics.activeDeployments - 1);
      this.systemMetrics.failedRequests++;
      this.emit('deploymentFailed', deployment);
    });
  }

  /**
   * Start monitoring and metrics collection
   */
  startMonitoring() {
    if (this.config.enableHealthMonitoring) {
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck().catch(error => {
          this.logger.error('Health check failed:', error);
        });
      }, this.config.healthCheckInterval);
    }

    if (this.config.enableMetrics) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics().catch(error => {
          this.logger.error('Metrics collection failed:', error);
        });
      }, this.config.metricsInterval);
    }
  }

  /**
   * Perform system health check
   */
  async performHealthCheck() {
    try {
      const healthStatus = {
        timestamp: Date.now(),
        overall: true,
        components: {}
      };

      // Check AgentAPI health
      try {
        await this.agentAPI.healthCheck();
        healthStatus.components.agentapi = { healthy: true };
      } catch (error) {
        healthStatus.components.agentapi = { healthy: false, error: error.message };
        healthStatus.overall = false;
      }

      // Check WSL2 Manager health
      try {
        const wsl2Stats = this.wsl2Manager.getStatistics();
        healthStatus.components.wsl2 = { 
          healthy: true, 
          instances: wsl2Stats.totalInstances,
          running: wsl2Stats.runningInstances
        };
      } catch (error) {
        healthStatus.components.wsl2 = { healthy: false, error: error.message };
        healthStatus.overall = false;
      }

      // Check Session Manager health
      try {
        const sessionStats = this.sessionManager.getStatistics();
        healthStatus.components.sessions = { 
          healthy: true, 
          total: sessionStats.totalSessions,
          active: sessionStats.activeSessions
        };
      } catch (error) {
        healthStatus.components.sessions = { healthy: false, error: error.message };
        healthStatus.overall = false;
      }

      this.systemMetrics.lastHealthCheck = healthStatus.timestamp;
      this.emit('healthCheck', healthStatus);

      if (!healthStatus.overall) {
        this.logger.warn('System health check failed:', healthStatus);
        this.emit('healthAlert', healthStatus);
      }

    } catch (error) {
      this.logger.error('Health check error:', error);
      this.emit('healthError', error);
    }
  }

  /**
   * Collect system metrics
   */
  async collectMetrics() {
    try {
      // Update component metrics
      const agentAPIMetrics = this.agentAPI.getMetrics();
      const wsl2Stats = this.wsl2Manager.getStatistics();
      const sessionStats = this.sessionManager.getStatistics();
      const claudeCodeStats = this.claudeCodeIntegration.getStatistics();

      const metrics = {
        timestamp: Date.now(),
        uptime: Date.now() - this.systemMetrics.startTime,
        system: this.systemMetrics,
        components: {
          agentapi: agentAPIMetrics,
          wsl2: wsl2Stats,
          sessions: sessionStats,
          claudeCode: claudeCodeStats
        }
      };

      this.emit('metrics', metrics);

    } catch (error) {
      this.logger.error('Metrics collection error:', error);
    }
  }

  /**
   * Setup graceful shutdown handling
   */
  setupGracefulShutdown() {
    const shutdownHandler = async (signal) => {
      this.logger.info(`Received ${signal}, initiating graceful shutdown`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
    process.on('SIGUSR2', shutdownHandler); // For nodemon
  }

  /**
   * Deploy and validate PR
   */
  async deployAndValidatePR(prData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Middleware system is not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('Middleware system is shutting down');
    }

    return this.claudeCodeIntegration.deployAndValidatePR(prData, options);
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentId) {
    return this.claudeCodeIntegration.getDeploymentStatus(deploymentId);
  }

  /**
   * Get all deployments
   */
  getAllDeployments() {
    return this.claudeCodeIntegration.getAllDeployments();
  }

  /**
   * Create agent session
   */
  async createAgentSession(agentType, config = {}) {
    if (!this.isInitialized) {
      throw new Error('Middleware system is not initialized');
    }

    return this.sessionManager.createSession(agentType, config);
  }

  /**
   * Send message to agent session
   */
  async sendMessageToSession(sessionId, message, options = {}) {
    return this.sessionManager.sendMessage(sessionId, message, options);
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId) {
    return this.sessionManager.getSessionStatus(sessionId);
  }

  /**
   * Stop agent session
   */
  async stopAgentSession(sessionId, reason = 'manual') {
    return this.sessionManager.stopSession(sessionId, reason);
  }

  /**
   * Create WSL2 instance
   */
  async createWSL2Instance(options = {}) {
    if (!this.isInitialized) {
      throw new Error('Middleware system is not initialized');
    }

    return this.wsl2Manager.createInstance(options);
  }

  /**
   * Deploy code to WSL2 instance
   */
  async deployCodeToInstance(instanceId, codeData) {
    return this.wsl2Manager.deployCode(instanceId, codeData);
  }

  /**
   * Get WSL2 instance status
   */
  async getInstanceStatus(instanceId) {
    return this.wsl2Manager.getInstanceStatus(instanceId);
  }

  /**
   * Destroy WSL2 instance
   */
  async destroyInstance(instanceId) {
    return this.wsl2Manager.destroyInstance(instanceId);
  }

  /**
   * Get system statistics
   */
  getSystemStatistics() {
    if (!this.isInitialized) {
      return { error: 'System not initialized' };
    }

    return {
      system: this.systemMetrics,
      components: {
        agentapi: this.agentAPI.getMetrics(),
        wsl2: this.wsl2Manager.getStatistics(),
        sessions: this.sessionManager.getStatistics(),
        claudeCode: this.claudeCodeIntegration.getStatistics()
      }
    };
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    return {
      initialized: this.isInitialized,
      shuttingDown: this.isShuttingDown,
      lastHealthCheck: this.systemMetrics.lastHealthCheck,
      componentHealth: this.systemMetrics.componentHealth,
      uptime: Date.now() - this.systemMetrics.startTime
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Starting graceful shutdown');

    try {
      // Stop monitoring
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }

      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = null;
      }

      // Shutdown components in reverse dependency order
      const shutdownPromises = [];

      if (this.claudeCodeIntegration) {
        shutdownPromises.push(this.claudeCodeIntegration.cleanup());
      }

      if (this.sessionManager) {
        shutdownPromises.push(this.sessionManager.cleanup());
      }

      if (this.wsl2Manager) {
        shutdownPromises.push(this.wsl2Manager.cleanup());
      }

      if (this.agentAPI) {
        shutdownPromises.push(this.agentAPI.cleanup());
      }

      // Wait for all components to shutdown with timeout
      await Promise.race([
        Promise.all(shutdownPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), this.config.gracefulShutdownTimeout)
        )
      ]);

      this.removeAllListeners();
      this.logger.info('Graceful shutdown completed');
      this.emit('shutdown');

    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      this.emit('shutdownError', error);
    }
  }
}

/**
 * Create and initialize middleware system
 */
export async function createAgentAPIMiddleware(config = {}) {
  const middleware = new AgentAPIMiddleware(config);
  await middleware.initialize();
  return middleware;
}

// Default export
export default AgentAPIMiddleware;

