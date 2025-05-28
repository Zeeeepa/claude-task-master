/**
 * Orchestration Engine - Main Entry Point
 * Exports all orchestration components and provides a unified interface
 */

// Core orchestration components
export { TaskOrchestrator, WorkflowStates } from './task-orchestrator.js';

// NLP components
export { TaskNLP } from '../nlp/task-nlp.js';

// Workflow components
export { WorkflowStateMachine } from '../workflow/state-machine.js';
export { DependencyResolver } from '../workflow/dependency-resolver.js';
export { ErrorRecoveryManager } from '../workflow/error-recovery.js';

// Database components
export { DatabaseManager } from '../database/database-manager.js';

// Integration components
export { AgentCoordinator } from '../integrations/agent-coordinator.js';

// State management
export { StateManager } from '../state-manager.js';

/**
 * Orchestration Engine Factory
 * Creates and configures a complete orchestration system
 */
export class OrchestrationEngine {
  constructor(options = {}) {
    this.options = {
      // Database configuration
      database: {
        host: options.database?.host || process.env.DB_HOST || 'localhost',
        port: options.database?.port || process.env.DB_PORT || 5432,
        database: options.database?.database || process.env.DB_NAME || 'codegen_taskmaster_db',
        username: options.database?.username || process.env.DB_USER || 'software_developer',
        password: options.database?.password || process.env.DB_PASSWORD || 'password',
        ssl: options.database?.ssl !== undefined ? options.database.ssl : true,
        ...options.database
      },
      
      // NLP configuration
      nlp: {
        provider: options.nlp?.provider || 'anthropic',
        model: options.nlp?.model || 'claude-3-5-sonnet-20241022',
        enableCaching: options.nlp?.enableCaching !== false,
        ...options.nlp
      },
      
      // Agent coordination configuration
      agentapi: {
        agentApiUrl: options.agentapi?.agentApiUrl || process.env.AGENTAPI_URL || 'http://localhost:8000',
        apiKey: options.agentapi?.apiKey || process.env.AGENTAPI_KEY,
        maxConcurrentAgents: options.agentapi?.maxConcurrentAgents || 5,
        ...options.agentapi
      },
      
      // Orchestrator configuration
      orchestrator: {
        maxConcurrentWorkflows: options.orchestrator?.maxConcurrentWorkflows || 20,
        taskTimeout: options.orchestrator?.taskTimeout || 600000, // 10 minutes
        retryAttempts: options.orchestrator?.retryAttempts || 3,
        enableNLP: options.orchestrator?.enableNLP !== false,
        enableAgentCoordination: options.orchestrator?.enableAgentCoordination !== false,
        ...options.orchestrator
      },
      
      // State management configuration
      stateManager: {
        persistState: options.stateManager?.persistState !== false,
        autoSave: options.stateManager?.autoSave !== false,
        saveInterval: options.stateManager?.saveInterval || 30000,
        ...options.stateManager
      },
      
      ...options
    };

    this.stateManager = null;
    this.initialized = false;
  }

  /**
   * Initialize the complete orchestration engine
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Orchestration Engine...');
      
      // Initialize state manager with orchestrator
      this.stateManager = new StateManager(this.options.stateManager);
      await this.stateManager.initialize({
        database: this.options.database,
        nlp: this.options.nlp,
        agentapi: this.options.agentapi,
        ...this.options.orchestrator
      });
      
      this.initialized = true;
      
      console.log('✅ Orchestration Engine initialized successfully');
      console.log('📊 Engine Configuration:');
      console.log(`   • Database: ${this.options.database.host}:${this.options.database.port}/${this.options.database.database}`);
      console.log(`   • NLP Provider: ${this.options.nlp.provider} (${this.options.nlp.model})`);
      console.log(`   • Agent API: ${this.options.agentapi.agentApiUrl}`);
      console.log(`   • Max Concurrent Workflows: ${this.options.orchestrator.maxConcurrentWorkflows}`);
      console.log(`   • State Persistence: ${this.options.stateManager.persistState ? 'Enabled' : 'Disabled'}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Orchestration Engine initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Process a task through the orchestration engine
   * @param {string|number} taskId - Task ID to process
   * @param {Object} options - Processing options
   */
  async processTask(taskId, options = {}) {
    this._ensureInitialized();
    return await this.stateManager.processTask(taskId, options);
  }

  /**
   * Process multiple tasks in batch
   * @param {Array} taskIds - Array of task IDs
   * @param {Object} options - Processing options
   */
  async processBatch(taskIds, options = {}) {
    this._ensureInitialized();
    
    if (!this.stateManager.orchestrator) {
      throw new Error('Orchestrator not available');
    }
    
    return await this.stateManager.orchestrator.processBatch(taskIds, options);
  }

  /**
   * Get workflow status
   * @param {string} workflowId - Workflow ID
   */
  async getWorkflowStatus(workflowId) {
    this._ensureInitialized();
    return await this.stateManager.getWorkflowState(workflowId);
  }

  /**
   * Cancel a workflow
   * @param {string} workflowId - Workflow ID
   */
  async cancelWorkflow(workflowId) {
    this._ensureInitialized();
    
    if (!this.stateManager.orchestrator) {
      throw new Error('Orchestrator not available');
    }
    
    return await this.stateManager.orchestrator.cancelWorkflow(workflowId);
  }

  /**
   * Get engine metrics and statistics
   */
  getMetrics() {
    this._ensureInitialized();
    return this.stateManager.getPerformanceMetrics();
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      orchestrator: this.stateManager ? this.stateManager.getOrchestratorState() : null,
      workflows: this.stateManager ? this.stateManager.getAllWorkflowStates() : {},
      metrics: this.initialized ? this.getMetrics() : null
    };
  }

  /**
   * Health check for all components
   */
  async healthCheck() {
    const health = {
      overall: 'healthy',
      components: {},
      timestamp: new Date()
    };

    try {
      // Check state manager
      health.components.stateManager = {
        status: this.stateManager ? 'healthy' : 'not_initialized',
        initialized: this.initialized
      };

      // Check database
      if (this.stateManager?.database) {
        health.components.database = await this.stateManager.database.healthCheck();
      } else {
        health.components.database = { status: 'not_available' };
      }

      // Check orchestrator
      if (this.stateManager?.orchestrator) {
        const metrics = this.stateManager.orchestrator.getMetrics();
        health.components.orchestrator = {
          status: 'healthy',
          activeWorkflows: metrics.activeWorkflows,
          queuedWorkflows: metrics.queuedWorkflows,
          uptime: metrics.uptime
        };
      } else {
        health.components.orchestrator = { status: 'not_available' };
      }

      // Check agent coordinator
      if (this.stateManager?.orchestrator?.agentCoordinator) {
        const stats = this.stateManager.orchestrator.agentCoordinator.getStatistics();
        health.components.agentCoordinator = {
          status: 'healthy',
          activeSessions: stats.activeSessions,
          totalSessions: stats.totalSessions
        };
      } else {
        health.components.agentCoordinator = { status: 'not_available' };
      }

      // Determine overall health
      const componentStatuses = Object.values(health.components).map(c => c.status);
      if (componentStatuses.some(s => s === 'unhealthy')) {
        health.overall = 'unhealthy';
      } else if (componentStatuses.some(s => s === 'not_available' || s === 'not_initialized')) {
        health.overall = 'degraded';
      }

    } catch (error) {
      health.overall = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Export engine configuration
   */
  exportConfiguration() {
    return {
      database: { ...this.options.database, password: '[REDACTED]' },
      nlp: this.options.nlp,
      agentapi: { ...this.options.agentapi, apiKey: '[REDACTED]' },
      orchestrator: this.options.orchestrator,
      stateManager: this.options.stateManager
    };
  }

  /**
   * Shutdown the orchestration engine gracefully
   */
  async shutdown() {
    console.log('🛑 Shutting down Orchestration Engine...');
    
    if (this.stateManager) {
      await this.stateManager.shutdown();
    }
    
    this.initialized = false;
    
    console.log('✅ Orchestration Engine shutdown complete');
  }

  /**
   * Private: Ensure engine is initialized
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Orchestration Engine not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create a pre-configured orchestration engine
 * @param {Object} options - Configuration options
 */
export function createOrchestrationEngine(options = {}) {
  return new OrchestrationEngine(options);
}

/**
 * Create orchestration engine with default configuration
 */
export function createDefaultOrchestrationEngine() {
  return new OrchestrationEngine({
    database: {
      // Use environment variables or defaults
    },
    nlp: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      enableCaching: true
    },
    orchestrator: {
      maxConcurrentWorkflows: 10, // Conservative default
      enableNLP: true,
      enableAgentCoordination: true
    },
    stateManager: {
      persistState: true,
      autoSave: true
    }
  });
}

// Default export
export default OrchestrationEngine;

