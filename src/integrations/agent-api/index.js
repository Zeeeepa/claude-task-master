/**
 * AgentAPI Middleware Integration
 * 
 * Enhanced integration layer for AgentAPI middleware with comprehensive
 * agent management, session handling, and real-time monitoring.
 */

// Core middleware components
export { EnhancedMiddlewareClient } from './enhanced_middleware_client.js';
export { AgentPoolManager } from './agent_pool_manager.js';
export { SessionManager } from './session_manager.js';
export { HealthMonitor } from './health_monitor.js';
export { MessageQueue } from './message_queue.js';
export { MetricsCollector } from './metrics_collector.js';

// Agent-specific adapters
export { ClaudeCodeAdapter } from './adapters/claude_code_adapter.js';
export { GooseAdapter } from './adapters/goose_adapter.js';
export { AiderAdapter } from './adapters/aider_adapter.js';
export { CodexAdapter } from './adapters/codex_adapter.js';

// Configuration management
export { 
  AgentConfigManager, 
  getConfigManager, 
  getAgentConfig, 
  getGlobalConfig, 
  getEnvironmentConfig 
} from '../../config/agent_config.js';

// Legacy exports for backward compatibility
export { MiddlewareServer } from './middleware-server.js';
export { RateLimiter } from './rate-limiter.js';
export { AuthHandler } from './auth-handler.js';
export { DataTransformer } from './data-transformer.js';
export { APIRouter } from './api-router.js';

// Integration examples
export * as Examples from './integration_example.js';

/**
 * Create a pre-configured enhanced middleware client
 */
export function createEnhancedClient(config = {}) {
  const { getEnvironmentConfig } = await import('../../config/agent_config.js');
  const envConfig = getEnvironmentConfig();
  
  return new EnhancedMiddlewareClient({
    baseUrl: envConfig.agentApiUrl,
    enableMetrics: envConfig.enableMetrics,
    enableHealthChecks: envConfig.enableHealthChecks,
    ...config
  });
}

/**
 * Create agent-specific adapters
 */
export function createAgentAdapters(config = {}) {
  const { getEnvironmentConfig } = await import('../../config/agent_config.js');
  const envConfig = getEnvironmentConfig();
  
  const baseConfig = {
    baseUrl: envConfig.agentApiUrl,
    ...config
  };

  return {
    claude: new ClaudeCodeAdapter(baseConfig),
    goose: new GooseAdapter(baseConfig),
    aider: new AiderAdapter(baseConfig),
    codex: new CodexAdapter(baseConfig)
  };
}

/**
 * Initialize the complete AgentAPI middleware system
 */
export async function initializeAgentAPISystem(config = {}) {
  console.log('🚀 Initializing AgentAPI Middleware System...');

  try {
    // Create enhanced client
    const client = await createEnhancedClient(config);
    
    // Initialize the client
    await client.initialize();
    
    console.log('✅ AgentAPI Middleware System initialized successfully');
    
    return {
      client,
      adapters: await createAgentAdapters(config),
      configManager: getConfigManager(),
      
      // Convenience methods
      async createSession(agentType, options = {}) {
        return await client.createSession(agentType, options);
      },
      
      async sendMessage(sessionId, message, options = {}) {
        return await client.sendMessage(sessionId, message, options);
      },
      
      async getMetrics() {
        return await client.getMetrics();
      },
      
      async getAgentStatus(agentType = null) {
        return await client.getAgentStatus(agentType);
      },
      
      async shutdown() {
        return await client.shutdown();
      }
    };
  } catch (error) {
    console.error('❌ Failed to initialize AgentAPI Middleware System:', error);
    throw error;
  }
}

// Default export
export default {
  EnhancedMiddlewareClient,
  AgentPoolManager,
  SessionManager,
  HealthMonitor,
  MessageQueue,
  MetricsCollector,
  ClaudeCodeAdapter,
  GooseAdapter,
  AiderAdapter,
  CodexAdapter,
  createEnhancedClient,
  createAgentAdapters,
  initializeAgentAPISystem,
  Examples
};
