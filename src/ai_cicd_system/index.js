/**
 * @fileoverview AI CI/CD System Main Entry Point
 * @description Unified AI CI/CD system with AgentAPI middleware integration
 */

// Core system components
export { WorkflowOrchestrator } from './core/workflow_orchestrator.js';
export { TaskStorageManager } from './core/task_storage_manager.js';
export { ValidationEngine } from './core/validation_engine.js';
export { RequirementProcessor } from './core/requirement_processor.js';
export { ContextManager } from './core/context_manager.js';
export { CodegenIntegrator } from './core/codegen_integrator.js';

// AgentAPI Middleware components
export { AgentAPIMiddleware } from './middleware/agent_api_middleware.js';
export { RequestTransformer } from './middleware/request_transformer.js';
export { SessionManager } from './middleware/session_manager.js';
export { ProtocolAdapter } from './middleware/protocol_adapter.js';
export { MessageQueue } from './middleware/message_queue.js';

// Communication clients
export { HTTPClient } from './communication/http_client.js';
export { WebSocketClient } from './communication/websocket_client.js';
export { EventStream } from './communication/event_stream.js';

// Protocol implementations
export { AgentProtocol } from './protocols/agent_protocol.js';
export { ClaudeCodeProtocol } from './protocols/claude_code_protocol.js';
export { UnifiedProtocol } from './protocols/unified_protocol.js';

// Utilities
export { log, info, warn, error, debug } from './utils/simple_logger.js';

// System configuration
export { default as SystemConfig } from './config/system_config.js';

// Monitoring
export { SystemMonitor } from './monitoring/system_monitor.js';

/**
 * Enhanced AI CI/CD System with AgentAPI Middleware
 */
export class EnhancedAICICDSystem {
  constructor(config = {}) {
    this.config = {
      // Core system configuration
      enableOrchestrator: config.enableOrchestrator !== false,
      enableValidation: config.enableValidation !== false,
      enableMonitoring: config.enableMonitoring !== false,
      
      // AgentAPI middleware configuration
      enableAgentAPI: config.enableAgentAPI !== false,
      agentApiUrl: config.agentApiUrl || 'http://localhost:8000',
      agentApiKey: config.agentApiKey || process.env.AGENT_API_KEY,
      enableWebSocket: config.enableWebSocket !== false,
      enableStreaming: config.enableStreaming !== false,
      
      // Communication configuration
      timeout: config.timeout || 120000,
      retryAttempts: config.retryAttempts || 3,
      maxConcurrentRequests: config.maxConcurrentRequests || 10,
      
      ...config
    };
    
    this.components = {};
    this.isInitialized = false;
  }

  /**
   * Initialize the enhanced AI CI/CD system
   */
  async initialize() {
    console.log('🚀 Initializing Enhanced AI CI/CD System with AgentAPI Middleware...');
    
    try {
      // Initialize core components
      if (this.config.enableOrchestrator) {
        const { WorkflowOrchestrator } = await import('./core/workflow_orchestrator.js');
        this.components.orchestrator = new WorkflowOrchestrator(this.config);
        await this.components.orchestrator.initialize();
      }
      
      if (this.config.enableValidation) {
        const { ValidationEngine } = await import('./core/validation_engine.js');
        this.components.validator = new ValidationEngine(this.config);
        await this.components.validator.initialize();
      }
      
      // Initialize AgentAPI middleware
      if (this.config.enableAgentAPI) {
        const { AgentAPIMiddleware } = await import('./middleware/agent_api_middleware.js');
        this.components.agentApiMiddleware = new AgentAPIMiddleware(this.config);
        await this.components.agentApiMiddleware.initialize();
      }
      
      // Initialize monitoring
      if (this.config.enableMonitoring) {
        const { SystemMonitor } = await import('./monitoring/system_monitor.js');
        this.components.monitor = new SystemMonitor(this.config);
        await this.components.monitor.initialize();
      }
      
      this.isInitialized = true;
      console.log('✅ Enhanced AI CI/CD System initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced AI CI/CD System:', error.message);
      throw error;
    }
  }

  /**
   * Process task through the enhanced system
   * @param {Object} task - Task to process
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result
   */
  async processTask(task, context = {}) {
    if (!this.isInitialized) {
      throw new Error('System not initialized. Call initialize() first.');
    }
    
    console.log(`🔄 Processing task: ${task.id}`);
    
    try {
      let result = { task, context };
      
      // Process through AgentAPI middleware if enabled
      if (this.components.agentApiMiddleware) {
        console.log('📡 Processing through AgentAPI middleware...');
        const claudeCodeRequest = await this.components.agentApiMiddleware.processTaskRequest(task, context);
        result.claudeCodeRequest = claudeCodeRequest;
        
        // Simulate Claude Code processing (in real implementation, this would be actual Claude Code)
        const claudeCodeResponse = await this.simulateClaudeCodeProcessing(claudeCodeRequest);
        result.claudeCodeResponse = claudeCodeResponse;
        
        // Process Claude Code response back through middleware
        const agentUpdate = await this.components.agentApiMiddleware.processClaudeCodeResponse(
          claudeCodeResponse,
          { sessionId: context.sessionId }
        );
        result.agentUpdate = agentUpdate;
      }
      
      // Process through workflow orchestrator if enabled
      if (this.components.orchestrator) {
        console.log('🎭 Processing through workflow orchestrator...');
        const workflowResult = await this.components.orchestrator.completeWorkflow(
          `workflow_${task.id}`,
          { task, context, middlewareResult: result }
        );
        result.workflowResult = workflowResult;
      }
      
      // Validate results if validation is enabled
      if (this.components.validator) {
        console.log('✅ Validating results...');
        const validationResult = await this.components.validator.validateWorkflow(result);
        result.validationResult = validationResult;
      }
      
      console.log(`✅ Task processing completed: ${task.id}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Task processing failed: ${task.id} - ${error.message}`);
      throw error;
    }
  }

  /**
   * Simulate Claude Code processing (placeholder for actual integration)
   * @param {Object} claudeCodeRequest - Claude Code request
   * @returns {Promise<Object>} Simulated Claude Code response
   */
  async simulateClaudeCodeProcessing(claudeCodeRequest) {
    // This is a simulation - in real implementation, this would call actual Claude Code
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing time
    
    return {
      validationId: claudeCodeRequest.id,
      success: Math.random() > 0.2, // 80% success rate
      issues: Math.random() > 0.7 ? [
        {
          type: 'warning',
          severity: 'medium',
          message: 'Consider adding input validation',
          file: 'src/example.js',
          line: 42
        }
      ] : [],
      suggestions: [
        {
          type: 'optimization',
          message: 'Use async/await for better readability',
          severity: 'low'
        }
      ],
      metrics: {
        codeQualityScore: Math.floor(Math.random() * 30) + 70, // 70-100
        testCoverage: Math.floor(Math.random() * 40) + 60, // 60-100
        performanceScore: Math.floor(Math.random() * 30) + 70 // 70-100
      },
      duration: Math.floor(Math.random() * 10000) + 5000, // 5-15 seconds
      environment: 'node-18'
    };
  }

  /**
   * Get system statistics
   * @returns {Object} System statistics
   */
  getStatistics() {
    const stats = {
      system: {
        initialized: this.isInitialized,
        components_loaded: Object.keys(this.components).length,
        uptime: this.isInitialized ? Date.now() - this.initTime : 0
      }
    };
    
    // Collect statistics from each component
    Object.entries(this.components).forEach(([name, component]) => {
      if (component.getStatistics) {
        stats[name] = component.getStatistics();
      }
    });
    
    return stats;
  }

  /**
   * Get system health
   * @returns {Object} System health status
   */
  getHealth() {
    const health = {
      status: this.isInitialized ? 'healthy' : 'not_initialized',
      components: {}
    };
    
    // Collect health from each component
    Object.entries(this.components).forEach(([name, component]) => {
      if (component.getHealth) {
        health.components[name] = component.getHealth();
      }
    });
    
    // Determine overall health
    const componentStatuses = Object.values(health.components).map(c => c.status);
    if (componentStatuses.some(status => status === 'unhealthy' || status === 'error')) {
      health.status = 'degraded';
    }
    
    return health;
  }

  /**
   * Shutdown the system
   */
  async shutdown() {
    console.log('🔄 Shutting down Enhanced AI CI/CD System...');
    
    // Shutdown all components
    for (const [name, component] of Object.entries(this.components)) {
      if (component.shutdown) {
        try {
          await component.shutdown();
          console.log(`✅ ${name} shutdown complete`);
        } catch (error) {
          console.error(`❌ Error shutting down ${name}:`, error.message);
        }
      }
    }
    
    this.components = {};
    this.isInitialized = false;
    
    console.log('✅ Enhanced AI CI/CD System shutdown complete');
  }
}

// Default export
export default EnhancedAICICDSystem;
