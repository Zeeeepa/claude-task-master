/**
 * AgentAPI Integration Module
 * 
 * Main entry point for the AgentAPI middleware integration system.
 * Exports all components for easy integration with the claude-task-master system.
 */

// Core components
export { AgentAPIClient } from './client.js';
export { TaskManager } from './task-manager.js';
export { WSL2InstanceManager } from './wsl2-manager.js';
export { LoadBalancer } from './load-balancer.js';

// Communication components
export { WebSocketClient } from './websocket-client.js';
export { TaskQueue, MessageQueue } from './message-queue.js';

// Monitoring and tracking
export { StatusTracker } from './status-tracker.js';
export { ErrorHandler } from './error-handler.js';

// Configuration and security
export { default as config } from './config.js';
export { AuthManager } from './auth.js';
export { AgentAPIMiddleware } from './middleware.js';

// Configuration helpers
export {
  agentApiConfig,
  getConfig,
  getEnvironmentConfig,
  validateConfig,
  getComponentConfig,
  createLogger,
  getEnvironmentTemplate
} from './config.js';

/**
 * Create a complete AgentAPI integration instance
 * @param {Object} config - Configuration options
 * @returns {Object} AgentAPI integration instance
 */
export function createAgentAPIIntegration(config = {}) {
  const {
    AgentAPIClient,
    TaskManager,
    WSL2InstanceManager,
    LoadBalancer,
    WebSocketClient,
    StatusTracker,
    ErrorHandler,
    AuthManager,
    AgentAPIMiddleware
  } = require('./index.js');

  const { getComponentConfig } = require('./config.js');

  // Initialize components with appropriate configurations
  const client = new AgentAPIClient(getComponentConfig('client', config));
  const taskManager = new TaskManager(getComponentConfig('taskManager', config));
  const wsl2Manager = new WSL2InstanceManager(getComponentConfig('wsl2Manager', config));
  const loadBalancer = new LoadBalancer(getComponentConfig('loadBalancer', config));
  const statusTracker = new StatusTracker(getComponentConfig('statusTracker', config));
  const errorHandler = new ErrorHandler(getComponentConfig('errorHandler', config));
  const authManager = new AuthManager(config.auth);
  const middleware = new AgentAPIMiddleware({
    ...config,
    agentApi: getComponentConfig('client', config),
    taskManager: getComponentConfig('taskManager', config),
    auth: config.auth
  });

  return {
    client,
    taskManager,
    wsl2Manager,
    loadBalancer,
    statusTracker,
    errorHandler,
    authManager,
    middleware,
    
    // Convenience methods
    async deployPR(prData) {
      return await client.deployPR(prData);
    },
    
    async getTaskStatus(taskId) {
      return taskManager.getTaskStatus(taskId);
    },
    
    async getAllTasks(filters) {
      return taskManager.getTasks(filters);
    },
    
    async getHealth() {
      return {
        client: client.getStatus(),
        taskManager: taskManager.getStatistics(),
        wsl2Manager: wsl2Manager.getStatistics(),
        loadBalancer: loadBalancer.getStatistics(),
        statusTracker: statusTracker.getStatistics(),
        errorHandler: errorHandler.getErrorStats(),
        auth: authManager.getStats()
      };
    },
    
    async shutdown() {
      await client.close();
      await taskManager.shutdown();
      await wsl2Manager.shutdown();
      await middleware.shutdown();
    }
  };
}

/**
 * Default export for convenience
 */
export default {
  AgentAPIClient,
  TaskManager,
  WSL2InstanceManager,
  LoadBalancer,
  WebSocketClient,
  TaskQueue,
  MessageQueue,
  StatusTracker,
  ErrorHandler,
  AuthManager,
  AgentAPIMiddleware,
  config,
  createAgentAPIIntegration,
  getConfig,
  getEnvironmentConfig,
  validateConfig,
  getComponentConfig,
  createLogger,
  getEnvironmentTemplate
};

