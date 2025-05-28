/**
 * Orchestration Manager
 * Integrates the orchestration engine with the existing task management system
 */

import { OrchestrationEngine } from '../../src/orchestration/index.js';
import { readTasks, writeTasks } from './utils.js';

/**
 * Orchestration Manager - Bridge between task management and orchestration engine
 */
export class OrchestrationManager {
  constructor(options = {}) {
    this.options = {
      tasksPath: options.tasksPath || './tasks/tasks.json',
      enableOrchestration: options.enableOrchestration !== false,
      autoProcessTasks: options.autoProcessTasks || false,
      ...options
    };

    this.engine = null;
    this.initialized = false;
  }

  /**
   * Initialize orchestration manager
   */
  async initialize() {
    try {
      if (!this.options.enableOrchestration) {
        console.log('📋 Orchestration disabled, using basic task management');
        return true;
      }

      console.log('🚀 Initializing Orchestration Manager...');
      
      // Create orchestration engine
      this.engine = new OrchestrationEngine({
        database: {
          // Configure based on environment or options
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          database: process.env.DB_NAME || 'codegen_taskmaster_db',
          username: process.env.DB_USER || 'software_developer',
          password: process.env.DB_PASSWORD || 'password'
        },
        nlp: {
          provider: process.env.NLP_PROVIDER || 'anthropic',
          model: process.env.NLP_MODEL || 'claude-3-5-sonnet-20241022'
        },
        orchestrator: {
          maxConcurrentWorkflows: parseInt(process.env.MAX_CONCURRENT_WORKFLOWS) || 10,
          enableNLP: process.env.ENABLE_NLP !== 'false',
          enableAgentCoordination: process.env.ENABLE_AGENT_COORDINATION !== 'false'
        }
      });

      // Initialize engine
      await this.engine.initialize();
      
      // Sync existing tasks to database
      await this._syncTasksToDatabase();
      
      this.initialized = true;
      console.log('✅ Orchestration Manager initialized successfully');
      
      return true;
      
    } catch (error) {
      console.error('❌ Orchestration Manager initialization failed:', error.message);
      
      // Fall back to basic task management
      this.options.enableOrchestration = false;
      console.log('📋 Falling back to basic task management');
      
      return false;
    }
  }

  /**
   * Process task with orchestration or fallback to basic processing
   * @param {string|number} taskId - Task ID
   * @param {Object} options - Processing options
   */
  async processTask(taskId, options = {}) {
    if (this.options.enableOrchestration && this.initialized) {
      return await this._processWithOrchestration(taskId, options);
    } else {
      return await this._processBasic(taskId, options);
    }
  }

  /**
   * Process multiple tasks
   * @param {Array} taskIds - Array of task IDs
   * @param {Object} options - Processing options
   */
  async processBatch(taskIds, options = {}) {
    if (this.options.enableOrchestration && this.initialized) {
      return await this.engine.processBatch(taskIds, options);
    } else {
      // Process sequentially for basic mode
      const results = [];
      for (const taskId of taskIds) {
        try {
          const result = await this._processBasic(taskId, options);
          results.push({ status: 'fulfilled', value: result });
        } catch (error) {
          results.push({ status: 'rejected', reason: error });
        }
      }
      return { results, total: taskIds.length };
    }
  }

  /**
   * Get workflow status
   * @param {string} workflowId - Workflow ID
   */
  async getWorkflowStatus(workflowId) {
    if (this.options.enableOrchestration && this.initialized) {
      return await this.engine.getWorkflowStatus(workflowId);
    } else {
      throw new Error('Orchestration not enabled');
    }
  }

  /**
   * Cancel workflow
   * @param {string} workflowId - Workflow ID
   */
  async cancelWorkflow(workflowId) {
    if (this.options.enableOrchestration && this.initialized) {
      return await this.engine.cancelWorkflow(workflowId);
    } else {
      throw new Error('Orchestration not enabled');
    }
  }

  /**
   * Get orchestration metrics
   */
  getMetrics() {
    if (this.options.enableOrchestration && this.initialized) {
      return this.engine.getMetrics();
    } else {
      return {
        orchestrationEnabled: false,
        basicMode: true
      };
    }
  }

  /**
   * Get orchestration status
   */
  getStatus() {
    return {
      orchestrationEnabled: this.options.enableOrchestration,
      initialized: this.initialized,
      engine: this.engine ? this.engine.getStatus() : null
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (this.options.enableOrchestration && this.initialized) {
      return await this.engine.healthCheck();
    } else {
      return {
        overall: 'healthy',
        mode: 'basic',
        orchestration: 'disabled'
      };
    }
  }

  /**
   * Parse natural language requirements into tasks
   * @param {string} description - Natural language description
   * @param {Object} context - Additional context
   */
  async parseRequirements(description, context = {}) {
    if (this.options.enableOrchestration && this.initialized) {
      const nlp = this.engine.stateManager.orchestrator.nlp;
      return await nlp.parseRequirements(description, context);
    } else {
      // Basic parsing fallback
      return this._basicRequirementsParsing(description);
    }
  }

  /**
   * Private: Process task with orchestration engine
   */
  async _processWithOrchestration(taskId, options) {
    try {
      console.log(`🎯 Processing task ${taskId} with orchestration engine`);
      
      // Get task from local storage first
      const tasks = await readTasks(this.options.tasksPath);
      const task = tasks.tasks.find(t => t.id == taskId);
      
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Ensure task is in database
      await this._ensureTaskInDatabase(task);
      
      // Process with orchestration engine
      const result = await this.engine.processTask(taskId, options);
      
      // Update local task status
      await this._updateLocalTaskStatus(taskId, 'in-progress');
      
      return result;
      
    } catch (error) {
      console.error(`❌ Orchestration processing failed for task ${taskId}:`, error.message);
      
      // Fall back to basic processing
      console.log('📋 Falling back to basic processing');
      return await this._processBasic(taskId, options);
    }
  }

  /**
   * Private: Basic task processing (fallback)
   */
  async _processBasic(taskId, options) {
    console.log(`📋 Processing task ${taskId} with basic task management`);
    
    // Update task status to in-progress
    await this._updateLocalTaskStatus(taskId, 'in-progress');
    
    // Return basic result
    return {
      taskId,
      workflowId: `basic_${taskId}_${Date.now()}`,
      status: 'processing',
      mode: 'basic',
      message: 'Task processed with basic task management. Enable orchestration for advanced features.'
    };
  }

  /**
   * Private: Sync existing tasks to database
   */
  async _syncTasksToDatabase() {
    try {
      const tasks = await readTasks(this.options.tasksPath);
      
      for (const task of tasks.tasks) {
        await this._ensureTaskInDatabase(task);
      }
      
      console.log(`📊 Synced ${tasks.tasks.length} tasks to database`);
      
    } catch (error) {
      console.warn('⚠️ Failed to sync tasks to database:', error.message);
    }
  }

  /**
   * Private: Ensure task exists in database
   */
  async _ensureTaskInDatabase(task) {
    if (!this.engine?.stateManager?.database) {
      return;
    }

    try {
      const existingTask = await this.engine.stateManager.database.getTask(task.id);
      
      if (!existingTask) {
        await this.engine.stateManager.database.createTask({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          dependencies: task.dependencies || [],
          metadata: {
            details: task.details,
            testStrategy: task.testStrategy,
            subtasks: task.subtasks
          }
        });
      }
    } catch (error) {
      console.warn(`⚠️ Failed to sync task ${task.id} to database:`, error.message);
    }
  }

  /**
   * Private: Update local task status
   */
  async _updateLocalTaskStatus(taskId, status) {
    try {
      const tasks = await readTasks(this.options.tasksPath);
      const task = tasks.tasks.find(t => t.id == taskId);
      
      if (task) {
        task.status = status;
        task.updatedAt = new Date().toISOString();
        await writeTasks(tasks, this.options.tasksPath);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to update local task ${taskId} status:`, error.message);
    }
  }

  /**
   * Private: Basic requirements parsing
   */
  _basicRequirementsParsing(description) {
    // Simple keyword-based parsing
    const actionableItems = [{
      id: 'basic_1',
      title: 'Complete Task',
      description: description,
      type: 'implementation',
      priority: 'medium',
      estimatedTime: '2-4 hours',
      dependencies: [],
      acceptanceCriteria: ['Task completed successfully']
    }];

    return {
      actionableItems,
      dependencies: [],
      metadata: {
        complexity: 'medium',
        technologies: [],
        riskFactors: []
      }
    };
  }

  /**
   * Shutdown orchestration manager
   */
  async shutdown() {
    if (this.engine) {
      await this.engine.shutdown();
    }
    
    this.initialized = false;
    console.log('✅ Orchestration Manager shutdown complete');
  }
}

/**
 * Create orchestration manager instance
 * @param {Object} options - Configuration options
 */
export function createOrchestrationManager(options = {}) {
  return new OrchestrationManager(options);
}

export default OrchestrationManager;

