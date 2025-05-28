/**
 * State Manager
 * Centralized state management for the orchestration engine
 */

import { EventEmitter } from 'events';
import { TaskOrchestrator } from './orchestration/task-orchestrator.js';
import { DatabaseManager } from './database/database-manager.js';

/**
 * State Manager - Centralized state management for orchestration
 */
export class StateManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      persistState: options.persistState !== false,
      stateFile: options.stateFile || '.orchestrator-state.json',
      autoSave: options.autoSave !== false,
      saveInterval: options.saveInterval || 30000, // 30 seconds
      ...options
    };

    // Core components
    this.orchestrator = null;
    this.database = null;
    
    // State tracking
    this.state = {
      orchestrator: {
        initialized: false,
        startTime: null,
        totalProcessed: 0,
        activeWorkflows: 0,
        queuedWorkflows: 0
      },
      workflows: new Map(),
      tasks: new Map(),
      agents: new Map(),
      metrics: {
        performance: {},
        errors: {},
        usage: {}
      }
    };

    // Auto-save timer
    this.saveTimer = null;
    
    this._setupEventHandlers();
  }

  /**
   * Initialize state manager with orchestrator
   * @param {Object} orchestratorOptions - Orchestrator configuration
   */
  async initialize(orchestratorOptions = {}) {
    try {
      console.log('🎛️ Initializing State Manager...');
      
      // Load persisted state
      if (this.options.persistState) {
        await this._loadState();
      }
      
      // Initialize orchestrator
      this.orchestrator = new TaskOrchestrator(orchestratorOptions);
      this.database = this.orchestrator.database;
      
      // Connect to orchestrator events
      this._connectOrchestratorEvents();
      
      // Initialize orchestrator
      await this.orchestrator.initialize();
      
      // Update state
      this.state.orchestrator.initialized = true;
      this.state.orchestrator.startTime = new Date();
      
      // Start auto-save
      if (this.options.autoSave) {
        this._startAutoSave();
      }
      
      this.emit('state_manager:initialized');
      console.log('✅ State Manager initialized successfully');
      
      return true;
      
    } catch (error) {
      this.emit('state_manager:error', error);
      throw new Error(`State Manager initialization failed: ${error.message}`);
    }
  }

  /**
   * Process task through orchestrator
   * @param {string|number} taskId - Task ID
   * @param {Object} options - Processing options
   */
  async processTask(taskId, options = {}) {
    if (!this.orchestrator) {
      throw new Error('State Manager not initialized');
    }

    try {
      // Update state before processing
      this.state.orchestrator.totalProcessed++;
      this.state.orchestrator.activeWorkflows++;
      
      // Process task
      const result = await this.orchestrator.processTask(taskId, options);
      
      // Update workflow state
      this._updateWorkflowState(result.workflowId, {
        taskId,
        status: 'processing',
        startTime: new Date(),
        options
      });
      
      return result;
      
    } catch (error) {
      this.state.orchestrator.activeWorkflows--;
      throw error;
    }
  }

  /**
   * Get current orchestrator state
   */
  getOrchestratorState() {
    if (!this.orchestrator) {
      return this.state.orchestrator;
    }

    const metrics = this.orchestrator.getMetrics();
    
    return {
      ...this.state.orchestrator,
      ...metrics,
      uptime: this.state.orchestrator.startTime ? 
        Date.now() - this.state.orchestrator.startTime.getTime() : 0
    };
  }

  /**
   * Get workflow state
   * @param {string} workflowId - Workflow ID
   */
  async getWorkflowState(workflowId) {
    // Try to get from orchestrator first (active workflows)
    if (this.orchestrator) {
      const activeState = await this.orchestrator.getWorkflowStatus(workflowId);
      if (activeState) {
        return activeState;
      }
    }

    // Fall back to local state
    return this.state.workflows.get(workflowId) || null;
  }

  /**
   * Get all workflow states
   */
  getAllWorkflowStates() {
    const workflows = {};
    
    // Add workflows from local state
    for (const [workflowId, workflow] of this.state.workflows) {
      workflows[workflowId] = workflow;
    }
    
    // Add active workflows from orchestrator
    if (this.orchestrator) {
      for (const [workflowId, workflow] of this.orchestrator.activeWorkflows) {
        workflows[workflowId] = {
          id: workflowId,
          status: workflow.currentState,
          progress: workflow.progress,
          startTime: workflow.startTime,
          currentStep: workflow.currentStep
        };
      }
    }
    
    return workflows;
  }

  /**
   * Get task state
   * @param {string|number} taskId - Task ID
   */
  async getTaskState(taskId) {
    // Try database first
    if (this.database) {
      const task = await this.database.getTask(taskId);
      if (task) {
        return task;
      }
    }
    
    // Fall back to local state
    return this.state.tasks.get(String(taskId)) || null;
  }

  /**
   * Update task state
   * @param {string|number} taskId - Task ID
   * @param {Object} updates - State updates
   */
  async updateTaskState(taskId, updates) {
    const taskIdStr = String(taskId);
    
    // Update in database
    if (this.database) {
      try {
        await this.database.updateTask(taskId, updates);
      } catch (error) {
        console.warn(`Failed to update task ${taskId} in database:`, error.message);
      }
    }
    
    // Update local state
    const currentState = this.state.tasks.get(taskIdStr) || {};
    this.state.tasks.set(taskIdStr, {
      ...currentState,
      ...updates,
      updatedAt: new Date()
    });
    
    this.emit('task:state_updated', { taskId, updates });
  }

  /**
   * Get agent state
   * @param {string} agentId - Agent ID
   */
  getAgentState(agentId) {
    return this.state.agents.get(agentId) || null;
  }

  /**
   * Update agent state
   * @param {string} agentId - Agent ID
   * @param {Object} updates - State updates
   */
  updateAgentState(agentId, updates) {
    const currentState = this.state.agents.get(agentId) || {};
    this.state.agents.set(agentId, {
      ...currentState,
      ...updates,
      updatedAt: new Date()
    });
    
    this.emit('agent:state_updated', { agentId, updates });
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const orchestratorMetrics = this.orchestrator ? 
      this.orchestrator.getMetrics() : {};
    
    return {
      orchestrator: orchestratorMetrics,
      workflows: {
        total: this.state.workflows.size,
        active: this.state.orchestrator.activeWorkflows,
        queued: this.state.orchestrator.queuedWorkflows
      },
      tasks: {
        total: this.state.tasks.size,
        processed: this.state.orchestrator.totalProcessed
      },
      agents: {
        total: this.state.agents.size,
        active: Array.from(this.state.agents.values())
          .filter(agent => agent.status === 'active').length
      },
      system: {
        uptime: this.state.orchestrator.startTime ? 
          Date.now() - this.state.orchestrator.startTime.getTime() : 0,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
  }

  /**
   * Export current state
   */
  exportState() {
    return {
      timestamp: new Date(),
      orchestrator: this.state.orchestrator,
      workflows: Object.fromEntries(this.state.workflows),
      tasks: Object.fromEntries(this.state.tasks),
      agents: Object.fromEntries(this.state.agents),
      metrics: this.state.metrics
    };
  }

  /**
   * Import state
   * @param {Object} stateData - State data to import
   */
  importState(stateData) {
    if (stateData.orchestrator) {
      this.state.orchestrator = { ...this.state.orchestrator, ...stateData.orchestrator };
    }
    
    if (stateData.workflows) {
      this.state.workflows = new Map(Object.entries(stateData.workflows));
    }
    
    if (stateData.tasks) {
      this.state.tasks = new Map(Object.entries(stateData.tasks));
    }
    
    if (stateData.agents) {
      this.state.agents = new Map(Object.entries(stateData.agents));
    }
    
    if (stateData.metrics) {
      this.state.metrics = { ...this.state.metrics, ...stateData.metrics };
    }
    
    this.emit('state:imported', { timestamp: stateData.timestamp });
  }

  /**
   * Reset state
   */
  resetState() {
    this.state = {
      orchestrator: {
        initialized: false,
        startTime: null,
        totalProcessed: 0,
        activeWorkflows: 0,
        queuedWorkflows: 0
      },
      workflows: new Map(),
      tasks: new Map(),
      agents: new Map(),
      metrics: {
        performance: {},
        errors: {},
        usage: {}
      }
    };
    
    this.emit('state:reset');
  }

  /**
   * Save state to file
   */
  async saveState() {
    if (!this.options.persistState) {
      return;
    }

    try {
      const fs = await import('fs/promises');
      const stateData = this.exportState();
      
      await fs.writeFile(
        this.options.stateFile,
        JSON.stringify(stateData, null, 2),
        'utf8'
      );
      
      this.emit('state:saved', { file: this.options.stateFile });
      
    } catch (error) {
      this.emit('state_manager:error', error);
      console.error('Failed to save state:', error.message);
    }
  }

  /**
   * Private: Load state from file
   */
  async _loadState() {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.options.stateFile, 'utf8');
      const stateData = JSON.parse(data);
      
      this.importState(stateData);
      this.emit('state:loaded', { file: this.options.stateFile });
      
      console.log(`📁 State loaded from ${this.options.stateFile}`);
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load state:', error.message);
      }
    }
  }

  /**
   * Private: Setup event handlers
   */
  _setupEventHandlers() {
    this.on('workflow:state_updated', ({ workflowId }) => {
      if (this.options.autoSave) {
        // Debounced save will be triggered by auto-save timer
      }
    });

    this.on('task:state_updated', ({ taskId }) => {
      if (this.options.autoSave) {
        // Debounced save will be triggered by auto-save timer
      }
    });
  }

  /**
   * Private: Connect to orchestrator events
   */
  _connectOrchestratorEvents() {
    if (!this.orchestrator) return;

    this.orchestrator.on('workflow:started', ({ workflowId, taskId }) => {
      this._updateWorkflowState(workflowId, {
        taskId,
        status: 'started',
        startTime: new Date()
      });
    });

    this.orchestrator.on('workflow:completed', ({ workflowId, success, finalState }) => {
      this._updateWorkflowState(workflowId, {
        status: finalState,
        success,
        endTime: new Date()
      });
      this.state.orchestrator.activeWorkflows--;
    });

    this.orchestrator.on('workflow:error', ({ workflowId, error }) => {
      this._updateWorkflowState(workflowId, {
        status: 'failed',
        error: error.message,
        endTime: new Date()
      });
      this.state.orchestrator.activeWorkflows--;
    });

    this.orchestrator.on('workflow:queued', ({ workflowId }) => {
      this.state.orchestrator.queuedWorkflows++;
    });
  }

  /**
   * Private: Update workflow state
   */
  _updateWorkflowState(workflowId, updates) {
    const currentState = this.state.workflows.get(workflowId) || {};
    this.state.workflows.set(workflowId, {
      ...currentState,
      ...updates,
      updatedAt: new Date()
    });
    
    this.emit('workflow:state_updated', { workflowId, updates });
  }

  /**
   * Private: Start auto-save timer
   */
  _startAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    
    this.saveTimer = setInterval(() => {
      this.saveState();
    }, this.options.saveInterval);
  }

  /**
   * Private: Stop auto-save timer
   */
  _stopAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Shutdown state manager
   */
  async shutdown() {
    console.log('🎛️ Shutting down State Manager...');
    
    // Stop auto-save
    this._stopAutoSave();
    
    // Save final state
    if (this.options.persistState) {
      await this.saveState();
    }
    
    // Shutdown orchestrator
    if (this.orchestrator) {
      await this.orchestrator.shutdown();
    }
    
    this.emit('state_manager:shutdown');
    console.log('✅ State Manager shutdown complete');
  }
}

export default StateManager;

