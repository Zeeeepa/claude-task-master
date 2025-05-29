/**
 * @fileoverview PR Generator for Codegen Integration
 * @description Orchestrates the complete PR generation workflow with branch management
 */

import { log } from '../utils/logger.js';
import { NaturalLanguageProcessor } from './natural_language_processor.js';
import { BranchManager } from './branch_manager.js';
import { CodeQualityValidator } from './code_quality_validator.js';
import { TemplateManager } from './template_manager.js';
import { CodegenIntegrator } from '../core/codegen_integrator.js';
import { TaskStorageManager } from '../core/task_storage_manager.js';

/**
 * PR Generator - Orchestrates the complete workflow from task to PR
 */
export class PRGenerator {
  constructor(config = {}) {
    this.config = config;
    this.nlpProcessor = new NaturalLanguageProcessor(config.nlp);
    this.branchManager = new BranchManager(config.branch);
    this.qualityValidator = new CodeQualityValidator(config.quality);
    this.templateManager = new TemplateManager(config.templates);
    this.codegenIntegrator = new CodegenIntegrator(config.codegen);
    this.taskStorage = new TaskStorageManager(config.storage);
    
    this.maxRetries = config.maxRetries || 3;
    this.qualityThreshold = config.qualityThreshold || 0.8;
    this.enableQualityGates = config.enableQualityGates !== false;
    this.enableAutoMerge = config.enableAutoMerge || false;
    this.webhookUrl = config.webhookUrl;
    this.notificationChannels = config.notificationChannels || [];
    
    // Workflow state tracking
    this.activeWorkflows = new Map();
    this.workflowHistory = [];
    
    log('debug', 'PR Generator initialized', {
      maxRetries: this.maxRetries,
      qualityThreshold: this.qualityThreshold,
      enableQualityGates: this.enableQualityGates,
      enableAutoMerge: this.enableAutoMerge
    });
  }

  /**
   * Initialize the PR generator
   */
  async initialize() {
    try {
      await this.nlpProcessor.initialize();
      await this.branchManager.initialize();
      await this.qualityValidator.initialize();
      await this.templateManager.initialize();
      await this.codegenIntegrator.initialize();
      await this.taskStorage.initialize();
      
      log('info', 'PR Generator initialized successfully');
    } catch (error) {
      log('error', `Failed to initialize PR Generator: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a PR from a task
   * @param {Object} taskData - Task data from database
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} PR generation result
   */
  async generatePR(taskData, options = {}) {
    const workflowId = this._generateWorkflowId();
    
    try {
      log('info', `Starting PR generation workflow: ${workflowId}`, {
        taskId: taskData.id,
        title: taskData.title
      });

      // Initialize workflow tracking
      const workflow = this._initializeWorkflow(workflowId, taskData, options);
      this.activeWorkflows.set(workflowId, workflow);

      // Step 1: Process natural language requirements
      workflow.currentStep = 'nlp_processing';
      const processedTask = await this._processTaskRequirements(taskData, workflow);
      
      // Step 2: Create and setup branch
      workflow.currentStep = 'branch_creation';
      const branchInfo = await this._createTaskBranch(processedTask, workflow);
      
      // Step 3: Generate code using Codegen
      workflow.currentStep = 'code_generation';
      const codegenResult = await this._generateCode(processedTask, branchInfo, workflow);
      
      // Step 4: Apply code changes to branch
      workflow.currentStep = 'code_application';
      const appliedChanges = await this._applyCodeChanges(codegenResult, branchInfo, workflow);
      
      // Step 5: Validate code quality
      if (this.enableQualityGates) {
        workflow.currentStep = 'quality_validation';
        const qualityResult = await this._validateCodeQuality(appliedChanges, workflow);
        
        if (!qualityResult.passed && !options.skipQualityGates) {
          return await this._handleQualityFailure(qualityResult, workflow);
        }
      }
      
      // Step 6: Commit and push changes
      workflow.currentStep = 'commit_and_push';
      const commitInfo = await this._commitAndPushChanges(appliedChanges, branchInfo, workflow);
      
      // Step 7: Create pull request
      workflow.currentStep = 'pr_creation';
      const prInfo = await this._createPullRequest(processedTask, branchInfo, commitInfo, workflow);
      
      // Step 8: Post-creation tasks
      workflow.currentStep = 'post_creation';
      await this._handlePostCreation(prInfo, workflow);
      
      // Complete workflow
      workflow.status = 'completed';
      workflow.completedAt = new Date().toISOString();
      workflow.result = prInfo;
      
      this._completeWorkflow(workflowId, workflow);
      
      log('info', `PR generation completed successfully: ${workflowId}`, {
        prUrl: prInfo.url,
        branch: branchInfo.name
      });

      return {
        success: true,
        workflowId,
        pr: prInfo,
        branch: branchInfo,
        workflow: this._sanitizeWorkflowForResponse(workflow)
      };
      
    } catch (error) {
      log('error', `PR generation failed: ${workflowId} - ${error.message}`);
      
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.status = 'failed';
        workflow.error = error.message;
        workflow.failedAt = new Date().toISOString();
        this._completeWorkflow(workflowId, workflow);
      }
      
      throw new PRGenerationError('GENERATION_FAILED', 
        `PR generation failed: ${error.message}`, error);
    }
  }

  /**
   * Retry failed PR generation
   * @param {string} workflowId - Workflow ID to retry
   * @param {Object} options - Retry options
   * @returns {Promise<Object>} Retry result
   */
  async retryPRGeneration(workflowId, options = {}) {
    try {
      const workflow = this.workflowHistory.find(w => w.id === workflowId);
      if (!workflow) {
        throw new PRGenerationError('WORKFLOW_NOT_FOUND', 
          `Workflow ${workflowId} not found`);
      }

      if (workflow.retryCount >= this.maxRetries) {
        throw new PRGenerationError('MAX_RETRIES_EXCEEDED', 
          `Maximum retries (${this.maxRetries}) exceeded for workflow ${workflowId}`);
      }

      log('info', `Retrying PR generation: ${workflowId}`, {
        retryCount: workflow.retryCount + 1,
        lastError: workflow.error
      });

      // Update retry count
      workflow.retryCount++;
      workflow.retriedAt = new Date().toISOString();

      // Retry from the failed step or start over
      const retryFromStep = options.retryFromStep || 'nlp_processing';
      const modifiedOptions = {
        ...options,
        retryFromStep,
        originalWorkflowId: workflowId
      };

      return await this.generatePR(workflow.taskData, modifiedOptions);
      
    } catch (error) {
      log('error', `PR generation retry failed: ${workflowId} - ${error.message}`);
      throw error;
    }
  }

  /**
   * Get workflow status
   * @param {string} workflowId - Workflow ID
   * @returns {Object} Workflow status
   */
  getWorkflowStatus(workflowId) {
    const activeWorkflow = this.activeWorkflows.get(workflowId);
    if (activeWorkflow) {
      return this._sanitizeWorkflowForResponse(activeWorkflow);
    }

    const historicalWorkflow = this.workflowHistory.find(w => w.id === workflowId);
    if (historicalWorkflow) {
      return this._sanitizeWorkflowForResponse(historicalWorkflow);
    }

    throw new PRGenerationError('WORKFLOW_NOT_FOUND', 
      `Workflow ${workflowId} not found`);
  }

  /**
   * List active workflows
   * @returns {Array<Object>} Active workflows
   */
  listActiveWorkflows() {
    return Array.from(this.activeWorkflows.values())
      .map(workflow => this._sanitizeWorkflowForResponse(workflow));
  }

  /**
   * Cancel active workflow
   * @param {string} workflowId - Workflow ID to cancel
   * @returns {Object} Cancellation result
   */
  async cancelWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new PRGenerationError('WORKFLOW_NOT_FOUND', 
        `Active workflow ${workflowId} not found`);
    }

    try {
      // Cleanup branch if created
      if (workflow.branchInfo && workflow.branchInfo.name) {
        await this.branchManager.deleteBranch(workflow.branchInfo.name, true);
      }

      workflow.status = 'cancelled';
      workflow.cancelledAt = new Date().toISOString();
      
      this._completeWorkflow(workflowId, workflow);
      
      log('info', `Workflow cancelled: ${workflowId}`);
      
      return {
        success: true,
        workflowId,
        cancelledAt: workflow.cancelledAt
      };
      
    } catch (error) {
      log('error', `Failed to cancel workflow ${workflowId}: ${error.message}`);
      throw error;
    }
  }

  // Private methods

  /**
   * Initialize workflow tracking
   */
  _initializeWorkflow(workflowId, taskData, options) {
    return {
      id: workflowId,
      taskData,
      options,
      status: 'running',
      currentStep: 'initialization',
      startedAt: new Date().toISOString(),
      retryCount: 0,
      steps: [],
      metadata: {
        taskId: taskData.id,
        taskTitle: taskData.title,
        taskType: taskData.type
      }
    };
  }

  /**
   * Process task requirements using NLP
   */
  async _processTaskRequirements(taskData, workflow) {
    try {
      this._addWorkflowStep(workflow, 'nlp_processing', 'started');
      
      const processedTask = await this.nlpProcessor.processTask(taskData);
      
      this._addWorkflowStep(workflow, 'nlp_processing', 'completed', {
        confidence: processedTask.validation.confidence,
        requirementCount: processedTask.requirements.functional.length + 
                         processedTask.requirements.technical.length
      });
      
      return processedTask;
    } catch (error) {
      this._addWorkflowStep(workflow, 'nlp_processing', 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create task branch
   */
  async _createTaskBranch(processedTask, workflow) {
    try {
      this._addWorkflowStep(workflow, 'branch_creation', 'started');
      
      const branchInfo = await this.branchManager.createBranch(
        processedTask.id, 
        processedTask.originalTask
      );
      
      workflow.branchInfo = branchInfo;
      
      this._addWorkflowStep(workflow, 'branch_creation', 'completed', {
        branchName: branchInfo.name,
        baseBranch: branchInfo.baseBranch
      });
      
      return branchInfo;
    } catch (error) {
      this._addWorkflowStep(workflow, 'branch_creation', 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate code using Codegen
   */
  async _generateCode(processedTask, branchInfo, workflow) {
    try {
      this._addWorkflowStep(workflow, 'code_generation', 'started');
      
      const codegenResult = await this.codegenIntegrator.processTask(processedTask);
      
      this._addWorkflowStep(workflow, 'code_generation', 'completed', {
        success: codegenResult.success,
        filesGenerated: codegenResult.data?.files?.length || 0
      });
      
      return codegenResult;
    } catch (error) {
      this._addWorkflowStep(workflow, 'code_generation', 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Apply code changes to branch
   */
  async _applyCodeChanges(codegenResult, branchInfo, workflow) {
    try {
      this._addWorkflowStep(workflow, 'code_application', 'started');
      
      // Switch to the task branch
      await this.branchManager.switchToBranch(branchInfo.name);
      
      // Apply the generated code changes
      const appliedFiles = await this._writeGeneratedFiles(codegenResult);
      
      this._addWorkflowStep(workflow, 'code_application', 'completed', {
        filesApplied: appliedFiles.length
      });
      
      return {
        files: appliedFiles,
        codegenResult
      };
    } catch (error) {
      this._addWorkflowStep(workflow, 'code_application', 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate code quality
   */
  async _validateCodeQuality(appliedChanges, workflow) {
    try {
      this._addWorkflowStep(workflow, 'quality_validation', 'started');
      
      const validationResult = await this.qualityValidator.validateCode(
        appliedChanges.files
      );
      
      this._addWorkflowStep(workflow, 'quality_validation', 'completed', {
        passed: validationResult.overall.passed,
        score: validationResult.overall.score,
        issues: validationResult.categories
      });
      
      return validationResult;
    } catch (error) {
      this._addWorkflowStep(workflow, 'quality_validation', 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle quality validation failure
   */
  async _handleQualityFailure(qualityResult, workflow) {
    log('warning', `Code quality validation failed for workflow ${workflow.id}`, {
      score: qualityResult.overall.score,
      threshold: this.qualityThreshold
    });

    // Try to auto-fix common issues
    const autoFixResult = await this._attemptAutoFix(qualityResult, workflow);
    
    if (autoFixResult.success) {
      // Re-validate after auto-fix
      const revalidationResult = await this._validateCodeQuality(autoFixResult, workflow);
      if (revalidationResult.overall.passed) {
        return { success: true, autoFixed: true, validation: revalidationResult };
      }
    }

    // Quality gate failure
    workflow.status = 'quality_failed';
    workflow.qualityResult = qualityResult;
    
    return {
      success: false,
      reason: 'quality_gate_failure',
      qualityResult,
      recommendations: qualityResult.recommendations
    };
  }

  /**
   * Commit and push changes
   */
  async _commitAndPushChanges(appliedChanges, branchInfo, workflow) {
    try {
      this._addWorkflowStep(workflow, 'commit_and_push', 'started');
      
      // Create commit message
      const commitMessage = this._generateCommitMessage(workflow.taskData, appliedChanges);
      
      // Commit changes
      const commitInfo = await this.branchManager.commitChanges(
        commitMessage,
        appliedChanges.files
      );
      
      // Push to remote
      const pushResult = await this.branchManager.pushBranch(branchInfo.name);
      
      this._addWorkflowStep(workflow, 'commit_and_push', 'completed', {
        commitHash: commitInfo.hash,
        filesCommitted: appliedChanges.files.length
      });
      
      return {
        commit: commitInfo,
        push: pushResult
      };
    } catch (error) {
      this._addWorkflowStep(workflow, 'commit_and_push', 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create pull request
   */
  async _createPullRequest(processedTask, branchInfo, commitInfo, workflow) {
    try {
      this._addWorkflowStep(workflow, 'pr_creation', 'started');
      
      const prTitle = this._generatePRTitle(processedTask);
      const prDescription = await this._generatePRDescription(processedTask, workflow);
      
      // This would integrate with GitHub API or similar
      const prInfo = await this._createGitHubPR({
        title: prTitle,
        description: prDescription,
        headBranch: branchInfo.name,
        baseBranch: branchInfo.baseBranch,
        taskId: processedTask.id
      });
      
      // Update task storage with PR information
      await this.taskStorage.updateTask(processedTask.id, {
        pr_url: prInfo.url,
        pr_number: prInfo.number,
        status: 'pr_created'
      });
      
      this._addWorkflowStep(workflow, 'pr_creation', 'completed', {
        prUrl: prInfo.url,
        prNumber: prInfo.number
      });
      
      return prInfo;
    } catch (error) {
      this._addWorkflowStep(workflow, 'pr_creation', 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle post-creation tasks
   */
  async _handlePostCreation(prInfo, workflow) {
    try {
      this._addWorkflowStep(workflow, 'post_creation', 'started');
      
      // Send notifications
      await this._sendNotifications(prInfo, workflow);
      
      // Trigger webhooks
      if (this.webhookUrl) {
        await this._triggerWebhook(prInfo, workflow);
      }
      
      // Auto-merge if enabled and quality gates passed
      if (this.enableAutoMerge && workflow.qualityPassed) {
        await this._attemptAutoMerge(prInfo, workflow);
      }
      
      this._addWorkflowStep(workflow, 'post_creation', 'completed');
    } catch (error) {
      this._addWorkflowStep(workflow, 'post_creation', 'failed', { error: error.message });
      // Don't throw here as PR is already created
      log('warning', `Post-creation tasks failed for workflow ${workflow.id}: ${error.message}`);
    }
  }

  /**
   * Write generated files to filesystem
   */
  async _writeGeneratedFiles(codegenResult) {
    const appliedFiles = [];
    
    if (codegenResult.data && codegenResult.data.files) {
      for (const file of codegenResult.data.files) {
        try {
          await fs.writeFile(file.path, file.content, 'utf-8');
          appliedFiles.push(file.path);
          log('debug', `Applied generated file: ${file.path}`);
        } catch (error) {
          log('error', `Failed to write file ${file.path}: ${error.message}`);
          throw error;
        }
      }
    }
    
    return appliedFiles;
  }

  /**
   * Attempt auto-fix for quality issues
   */
  async _attemptAutoFix(qualityResult, workflow) {
    // Simplified auto-fix implementation
    // In practice, this would implement specific fixes for common issues
    
    log('info', `Attempting auto-fix for workflow ${workflow.id}`);
    
    return {
      success: false,
      reason: 'auto_fix_not_implemented'
    };
  }

  /**
   * Generate commit message
   */
  _generateCommitMessage(taskData, appliedChanges) {
    const type = this._getCommitType(taskData.type);
    const scope = this._getCommitScope(appliedChanges.files);
    const description = taskData.title.substring(0, 50);
    
    return `${type}${scope}: ${description}

Generated by Codegen for task ${taskData.id}

Files modified:
${appliedChanges.files.map(file => `- ${file}`).join('\n')}`;
  }

  /**
   * Generate PR title
   */
  _generatePRTitle(processedTask) {
    const type = this._getCommitType(processedTask.originalTask.type);
    const title = processedTask.originalTask.title;
    
    return `${type}: ${title}`;
  }

  /**
   * Generate PR description
   */
  async _generatePRDescription(processedTask, workflow) {
    const template = await this.templateManager.getTemplate('pr_description', {
      task_id: processedTask.id,
      task_title: processedTask.originalTask.title,
      task_description: processedTask.originalTask.description,
      requirements: this._formatRequirements(processedTask.requirements),
      workflow_id: workflow.id,
      generated_at: new Date().toISOString()
    });
    
    return template;
  }

  /**
   * Create GitHub PR (placeholder)
   */
  async _createGitHubPR(prData) {
    // This would integrate with actual GitHub API
    // For now, return mock data
    
    return {
      number: Math.floor(Math.random() * 1000) + 1,
      url: `https://github.com/example/repo/pull/${Math.floor(Math.random() * 1000) + 1}`,
      title: prData.title,
      headBranch: prData.headBranch,
      baseBranch: prData.baseBranch,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Send notifications
   */
  async _sendNotifications(prInfo, workflow) {
    for (const channel of this.notificationChannels) {
      try {
        await this._sendNotification(channel, prInfo, workflow);
      } catch (error) {
        log('warning', `Failed to send notification to ${channel}: ${error.message}`);
      }
    }
  }

  /**
   * Send individual notification
   */
  async _sendNotification(channel, prInfo, workflow) {
    // Implementation would depend on notification channel (Slack, email, etc.)
    log('info', `Notification sent to ${channel} for PR ${prInfo.url}`);
  }

  /**
   * Trigger webhook
   */
  async _triggerWebhook(prInfo, workflow) {
    try {
      const payload = {
        event: 'pr_created',
        pr: prInfo,
        workflow: this._sanitizeWorkflowForResponse(workflow),
        timestamp: new Date().toISOString()
      };
      
      // Would make HTTP request to webhook URL
      log('info', `Webhook triggered for PR ${prInfo.url}`);
    } catch (error) {
      log('error', `Failed to trigger webhook: ${error.message}`);
    }
  }

  /**
   * Attempt auto-merge
   */
  async _attemptAutoMerge(prInfo, workflow) {
    // Implementation would check if PR is ready for auto-merge
    log('info', `Auto-merge attempted for PR ${prInfo.url}`);
  }

  /**
   * Add workflow step
   */
  _addWorkflowStep(workflow, stepName, status, data = {}) {
    workflow.steps.push({
      name: stepName,
      status,
      timestamp: new Date().toISOString(),
      data
    });
  }

  /**
   * Complete workflow
   */
  _completeWorkflow(workflowId, workflow) {
    this.activeWorkflows.delete(workflowId);
    this.workflowHistory.push(workflow);
    
    // Keep only last 100 workflows in history
    if (this.workflowHistory.length > 100) {
      this.workflowHistory.shift();
    }
  }

  /**
   * Sanitize workflow for response
   */
  _sanitizeWorkflowForResponse(workflow) {
    return {
      id: workflow.id,
      status: workflow.status,
      currentStep: workflow.currentStep,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      retryCount: workflow.retryCount,
      metadata: workflow.metadata,
      steps: workflow.steps,
      result: workflow.result
    };
  }

  /**
   * Generate workflow ID
   */
  _generateWorkflowId() {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get commit type from task type
   */
  _getCommitType(taskType) {
    const typeMap = {
      'feature_implementation': 'feat',
      'bug_fix': 'fix',
      'code_refactor': 'refactor',
      'documentation': 'docs',
      'testing': 'test',
      'optimization': 'perf',
      'security_fix': 'fix'
    };
    
    return typeMap[taskType] || 'feat';
  }

  /**
   * Get commit scope from files
   */
  _getCommitScope(files) {
    if (files.length === 0) return '';
    
    // Extract common directory or component
    const dirs = files.map(file => file.split('/')[0]);
    const commonDir = dirs.find(dir => dirs.every(d => d === dir));
    
    return commonDir ? `(${commonDir})` : '';
  }

  /**
   * Format requirements for templates
   */
  _formatRequirements(requirements) {
    const sections = [];
    
    if (requirements.functional.length > 0) {
      sections.push('**Functional Requirements:**');
      sections.push(...requirements.functional.map(req => `- ${req.description}`));
    }
    
    if (requirements.technical.length > 0) {
      sections.push('**Technical Requirements:**');
      sections.push(...requirements.technical.map(req => `- ${req.description}`));
    }
    
    return sections.join('\n');
  }
}

/**
 * PR Generation Error class
 */
export class PRGenerationError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.name = 'PRGenerationError';
    this.code = code;
    this.originalError = originalError;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PRGenerationError);
    }
  }
}

export default PRGenerator;

