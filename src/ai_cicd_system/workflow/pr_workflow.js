/**
 * @fileoverview PR Creation Workflow Orchestration
 * @description Advanced workflow orchestration for PR creation and management
 */

import { log } from '../utils/logger.js';
import { PRCreator } from '../integrations/codegen/pr_creator.js';
import { TaskProcessor } from './task_processor.js';

/**
 * PR Workflow Orchestrator for managing the complete PR creation process
 */
export class PRWorkflow {
  constructor(config = {}) {
    this.config = {
      enableAutoReview: config.enableAutoReview !== false,
      enableStatusTracking: config.enableStatusTracking !== false,
      enableNotifications: config.enableNotifications !== false,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 5000,
      timeoutMs: config.timeoutMs || 600000, // 10 minutes
      defaultReviewers: config.defaultReviewers || [],
      autoMergeEnabled: config.autoMergeEnabled || false
    };
    
    // Initialize components
    this.prCreator = new PRCreator(config.prCreator);
    this.taskProcessor = new TaskProcessor(config.taskProcessor);
    
    // Workflow state tracking
    this.activeWorkflows = new Map();
    this.workflowHistory = [];
    this.isInitialized = false;
    
    // Event handlers
    this.eventHandlers = {
      'workflow.started': [],
      'workflow.completed': [],
      'workflow.failed': [],
      'pr.created': [],
      'pr.updated': [],
      'pr.merged': [],
      'review.requested': [],
      'review.completed': []
    };
    
    log('debug', 'PRWorkflow initialized', { config: this.config });
  }

  /**
   * Initialize the PR workflow
   */
  async initialize() {
    try {
      log('info', 'Initializing PRWorkflow...');
      
      await this.taskProcessor.initialize();
      
      this.isInitialized = true;
      log('info', 'PRWorkflow initialized successfully');
      
    } catch (error) {
      log('error', `PRWorkflow initialization failed: ${error.message}`);
      throw new Error(`PRWorkflow initialization failed: ${error.message}`);
    }
  }

  /**
   * Execute complete PR workflow from natural language task
   * @param {Object} task - Task description and context
   * @param {Object} options - Workflow options
   * @returns {Promise<Object>} Workflow result
   */
  async executeWorkflow(task, options = {}) {
    this._ensureInitialized();
    
    const workflowId = this._generateWorkflowId();
    const startTime = Date.now();
    
    try {
      log('info', `Starting PR workflow ${workflowId} for task: ${task.description.substring(0, 100)}...`);
      
      const workflow = {
        id: workflowId,
        task,
        options,
        status: 'started',
        startTime: new Date(startTime).toISOString(),
        steps: [],
        result: null,
        metadata: {
          processingTimeMs: 0,
          retryCount: 0,
          errors: []
        }
      };
      
      // Track active workflow
      this.activeWorkflows.set(workflowId, workflow);
      
      // Emit workflow started event
      await this._emitEvent('workflow.started', { workflow });
      
      // Step 1: Process task with AI analysis
      workflow.steps.push(await this._executeStep('task_processing', async () => {
        log('debug', `${workflowId}: Processing task with AI analysis`);
        
        const processingResult = await this.taskProcessor.processTask(task, {
          ...options,
          workflowId
        });
        
        if (processingResult.status !== 'completed') {
          throw new Error(`Task processing failed: ${processingResult.error?.message || 'Unknown error'}`);
        }
        
        return processingResult;
      }));
      
      const taskResult = workflow.steps[0].result;
      
      // Step 2: Create PR data structure
      workflow.steps.push(await this._executeStep('pr_creation', async () => {
        log('debug', `${workflowId}: Creating PR data structure`);
        
        if (!taskResult.codegenResult || !taskResult.codegenResult.success) {
          throw new Error('No successful Codegen result available for PR creation');
        }
        
        const prData = await this.prCreator.createPR(
          taskResult.codegenResult,
          taskResult.analysis.basic,
          {
            repository: options.repository,
            baseBranch: options.baseBranch,
            reviewers: options.reviewers || this.config.defaultReviewers,
            ...options.prOptions
          }
        );
        
        return prData;
      }));
      
      const prData = workflow.steps[1].result;
      
      // Step 3: Submit PR to repository
      workflow.steps.push(await this._executeStep('pr_submission', async () => {
        log('debug', `${workflowId}: Submitting PR to repository`);
        
        const submissionResult = await this._submitPR(prData, options);
        
        // Emit PR created event
        await this._emitEvent('pr.created', { 
          workflow, 
          prData, 
          submissionResult 
        });
        
        return submissionResult;
      }));
      
      const submissionResult = workflow.steps[2].result;
      
      // Step 4: Request reviews if enabled
      if (this.config.enableAutoReview && prData.reviewers.length > 0) {
        workflow.steps.push(await this._executeStep('review_request', async () => {
          log('debug', `${workflowId}: Requesting PR reviews`);
          
          const reviewResult = await this._requestReviews(
            submissionResult.prNumber,
            prData.reviewers,
            options
          );
          
          // Emit review requested event
          await this._emitEvent('review.requested', { 
            workflow, 
            prNumber: submissionResult.prNumber,
            reviewers: prData.reviewers 
          });
          
          return reviewResult;
        }));
      }
      
      // Step 5: Set up status tracking if enabled
      if (this.config.enableStatusTracking) {
        workflow.steps.push(await this._executeStep('status_tracking', async () => {
          log('debug', `${workflowId}: Setting up status tracking`);
          
          const trackingResult = await this._setupStatusTracking(
            submissionResult.prNumber,
            options
          );
          
          return trackingResult;
        }));
      }
      
      // Finalize workflow
      workflow.status = 'completed';
      workflow.endTime = new Date().toISOString();
      workflow.metadata.processingTimeMs = Date.now() - startTime;
      workflow.result = {
        prNumber: submissionResult.prNumber,
        prUrl: submissionResult.prUrl,
        taskResult,
        prData,
        submissionResult
      };
      
      // Move to history
      this.activeWorkflows.delete(workflowId);
      this.workflowHistory.push(workflow);
      
      // Emit workflow completed event
      await this._emitEvent('workflow.completed', { workflow });
      
      log('info', `PR workflow ${workflowId} completed successfully`, {
        prNumber: submissionResult.prNumber,
        prUrl: submissionResult.prUrl,
        processingTime: workflow.metadata.processingTimeMs,
        steps: workflow.steps.length
      });
      
      return workflow;
      
    } catch (error) {
      log('error', `PR workflow ${workflowId} failed: ${error.message}`);
      
      // Update workflow with error
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.status = 'failed';
        workflow.endTime = new Date().toISOString();
        workflow.metadata.processingTimeMs = Date.now() - startTime;
        workflow.error = {
          message: error.message,
          type: error.constructor.name,
          timestamp: new Date().toISOString()
        };
        
        // Move to history
        this.activeWorkflows.delete(workflowId);
        this.workflowHistory.push(workflow);
        
        // Emit workflow failed event
        await this._emitEvent('workflow.failed', { workflow, error });
      }
      
      throw error;
    }
  }

  /**
   * Execute multiple workflows in batch
   * @param {Array} tasks - Tasks to process
   * @param {Object} options - Batch options
   * @returns {Promise<Array>} Workflow results
   */
  async executeBatch(tasks, options = {}) {
    this._ensureInitialized();
    
    log('info', `Starting batch PR workflow for ${tasks.length} tasks`);
    
    const batchOptions = {
      ...options,
      concurrent: options.concurrent || 2,
      failFast: options.failFast || false,
      delayBetweenMs: options.delayBetweenMs || 1000
    };
    
    const results = [];
    const batches = this._createBatches(tasks, batchOptions.concurrent);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      log('debug', `Processing batch ${i + 1}/${batches.length} with ${batch.length} tasks`);
      
      const batchPromises = batch.map(task => 
        this.executeWorkflow(task, options).catch(error => ({
          id: `failed_${Date.now()}`,
          status: 'failed',
          error: { message: error.message },
          task
        }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Check for failures if failFast is enabled
      if (batchOptions.failFast && batchResults.some(r => r.status === 'failed')) {
        log('warning', 'Batch processing stopped due to failure (failFast enabled)');
        break;
      }
      
      // Add delay between batches
      if (i < batches.length - 1 && batchOptions.delayBetweenMs > 0) {
        await this._sleep(batchOptions.delayBetweenMs);
      }
    }
    
    log('info', `Batch PR workflow completed`, {
      total: tasks.length,
      successful: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length
    });
    
    return results;
  }

  /**
   * Get workflow status
   * @param {string} workflowId - Workflow ID
   * @returns {Object|null} Workflow status
   */
  getWorkflowStatus(workflowId) {
    const active = this.activeWorkflows.get(workflowId);
    if (active) {
      return {
        ...active,
        isActive: true
      };
    }
    
    const historical = this.workflowHistory.find(w => w.id === workflowId);
    if (historical) {
      return {
        ...historical,
        isActive: false
      };
    }
    
    return null;
  }

  /**
   * Cancel active workflow
   * @param {string} workflowId - Workflow ID
   * @returns {boolean} Success status
   */
  async cancelWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return false;
    }
    
    try {
      log('info', `Cancelling workflow ${workflowId}`);
      
      workflow.status = 'cancelled';
      workflow.endTime = new Date().toISOString();
      workflow.metadata.processingTimeMs = Date.now() - new Date(workflow.startTime).getTime();
      
      // Move to history
      this.activeWorkflows.delete(workflowId);
      this.workflowHistory.push(workflow);
      
      // Emit workflow failed event
      await this._emitEvent('workflow.failed', { 
        workflow, 
        error: new Error('Workflow cancelled by user') 
      });
      
      return true;
      
    } catch (error) {
      log('error', `Failed to cancel workflow ${workflowId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Add event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  /**
   * Remove event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    if (this.eventHandlers[event]) {
      const index = this.eventHandlers[event].indexOf(handler);
      if (index > -1) {
        this.eventHandlers[event].splice(index, 1);
      }
    }
  }

  /**
   * Get workflow statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const completed = this.workflowHistory.filter(w => w.status === 'completed');
    const failed = this.workflowHistory.filter(w => w.status === 'failed');
    const cancelled = this.workflowHistory.filter(w => w.status === 'cancelled');
    
    return {
      total: this.workflowHistory.length,
      active: this.activeWorkflows.size,
      completed: completed.length,
      failed: failed.length,
      cancelled: cancelled.length,
      successRate: this.workflowHistory.length > 0 ? 
        (completed.length / this.workflowHistory.length) * 100 : 0,
      averageProcessingTime: completed.length > 0 ?
        completed.reduce((sum, w) => sum + w.metadata.processingTimeMs, 0) / completed.length : 0,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Get health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {}
    };
    
    try {
      // Check task processor health
      health.components.taskProcessor = await this.taskProcessor.getHealth();
      if (health.components.taskProcessor.status !== 'healthy') {
        health.status = 'degraded';
      }
      
      // Check workflow state
      health.components.workflow = {
        initialized: this.isInitialized,
        activeWorkflows: this.activeWorkflows.size,
        totalWorkflows: this.workflowHistory.length
      };
      
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }
    
    return health;
  }

  /**
   * Shutdown the workflow
   */
  async shutdown() {
    log('info', 'Shutting down PRWorkflow...');
    
    // Cancel all active workflows
    for (const workflowId of this.activeWorkflows.keys()) {
      await this.cancelWorkflow(workflowId);
    }
    
    await this.taskProcessor.shutdown();
    
    this.activeWorkflows.clear();
    this.isInitialized = false;
    
    log('info', 'PRWorkflow shutdown complete');
  }

  // Private helper methods

  /**
   * Ensure workflow is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('PRWorkflow must be initialized before use');
    }
  }

  /**
   * Generate unique workflow ID
   * @returns {string} Workflow ID
   * @private
   */
  _generateWorkflowId() {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Execute a workflow step
   * @param {string} stepName - Step name
   * @param {Function} stepFunction - Step function
   * @returns {Promise<Object>} Step result
   * @private
   */
  async _executeStep(stepName, stepFunction) {
    const startTime = Date.now();
    
    try {
      log('debug', `Executing step: ${stepName}`);
      
      const result = await stepFunction();
      
      return {
        name: stepName,
        status: 'completed',
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        result
      };
      
    } catch (error) {
      log('error', `Step ${stepName} failed: ${error.message}`);
      
      return {
        name: stepName,
        status: 'failed',
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: {
          message: error.message,
          type: error.constructor.name
        }
      };
    }
  }

  /**
   * Submit PR to repository
   * @param {Object} prData - PR data
   * @param {Object} options - Submission options
   * @returns {Promise<Object>} Submission result
   * @private
   */
  async _submitPR(prData, options) {
    // This would integrate with actual Git/GitHub API
    // For now, return a mock result
    
    const prNumber = Math.floor(Math.random() * 1000) + 1;
    const prUrl = `https://github.com/${options.repository}/pull/${prNumber}`;
    
    return {
      success: true,
      prNumber,
      prUrl,
      title: prData.title,
      body: prData.body,
      head: prData.head,
      base: prData.base,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Request PR reviews
   * @param {number} prNumber - PR number
   * @param {Array} reviewers - Reviewers
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Review request result
   * @private
   */
  async _requestReviews(prNumber, reviewers, options) {
    // This would integrate with actual GitHub API
    // For now, return a mock result
    
    return {
      success: true,
      prNumber,
      reviewers,
      requestedAt: new Date().toISOString()
    };
  }

  /**
   * Set up status tracking
   * @param {number} prNumber - PR number
   * @param {Object} options - Tracking options
   * @returns {Promise<Object>} Tracking setup result
   * @private
   */
  async _setupStatusTracking(prNumber, options) {
    // This would set up webhooks or polling for PR status
    // For now, return a mock result
    
    return {
      success: true,
      prNumber,
      trackingEnabled: true,
      setupAt: new Date().toISOString()
    };
  }

  /**
   * Emit event to handlers
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @private
   */
  async _emitEvent(event, data) {
    const handlers = this.eventHandlers[event] || [];
    
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (error) {
        log('error', `Event handler error for ${event}: ${error.message}`);
      }
    }
  }

  /**
   * Create batches from tasks array
   * @param {Array} tasks - Tasks
   * @param {number} batchSize - Batch size
   * @returns {Array} Batches
   * @private
   */
  _createBatches(tasks, batchSize) {
    const batches = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Sleep promise
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear workflow history
   * @param {Object} options - Clear options
   */
  clearHistory(options = {}) {
    const maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoff = Date.now() - maxAge;
    
    const before = this.workflowHistory.length;
    this.workflowHistory = this.workflowHistory.filter(workflow => {
      const workflowTime = new Date(workflow.startTime).getTime();
      return workflowTime > cutoff;
    });
    
    const removed = before - this.workflowHistory.length;
    log('debug', `Cleared ${removed} workflows from history`);
    
    return removed;
  }
}

export default PRWorkflow;

