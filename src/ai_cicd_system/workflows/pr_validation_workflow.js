/**
 * PR Validation Workflow - Orchestrates the complete PR validation pipeline
 * Coordinates Claude Code integration, analysis, and reporting
 */

import { log } from '../utils/simple_logger.js';
import { ClaudeCodeIntegrator } from '../integrations/claude_code_integrator.js';

export class PRValidationWorkflow {
  constructor(config = {}) {
    this.config = {
      enableParallelValidation: config.enableParallelValidation !== false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      timeoutMs: config.timeoutMs || 600000, // 10 minutes
      ...config
    };
    
    this.claudeCodeIntegrator = new ClaudeCodeIntegrator(this.config);
    this.isInitialized = false;
    this.activeWorkflows = new Map();
  }

  async initialize() {
    log('info', '🔧 Initializing PR validation workflow...');
    
    try {
      await this.claudeCodeIntegrator.initialize();
      this.isInitialized = true;
      log('info', '✅ PR validation workflow initialized');
    } catch (error) {
      log('error', `❌ Failed to initialize PR validation workflow: ${error.message}`);
      throw error;
    }
  }

  async validatePR(prDetails, options = {}) {
    if (!this.isInitialized) {
      throw new Error('PR validation workflow not initialized. Call initialize() first.');
    }

    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    log('info', `🚀 Starting PR validation workflow: ${prDetails.prNumber} (${workflowId})`);
    
    const workflow = {
      id: workflowId,
      prNumber: prDetails.prNumber,
      startTime: new Date(),
      status: 'initializing',
      steps: [],
      result: null,
      error: null
    };

    this.activeWorkflows.set(workflowId, workflow);

    try {
      // Step 1: Pre-validation checks
      await this.runPreValidationChecks(workflow, prDetails, options);
      
      // Step 2: Environment setup and validation
      await this.runValidationStep(workflow, prDetails, options);
      
      // Step 3: Post-validation processing
      await this.runPostValidationProcessing(workflow, prDetails, options);
      
      // Step 4: Generate final report
      await this.generateFinalReport(workflow, prDetails, options);
      
      workflow.status = 'completed';
      workflow.endTime = new Date();
      workflow.duration = workflow.endTime - workflow.startTime;
      
      log('info', `✅ PR validation workflow completed: ${prDetails.prNumber} in ${workflow.duration}ms`);
      
      return workflow.result;
      
    } catch (error) {
      workflow.status = 'failed';
      workflow.error = error.message;
      workflow.endTime = new Date();
      
      log('error', `❌ PR validation workflow failed: ${prDetails.prNumber} - ${error.message}`);
      
      // Attempt retry if configured
      if (options.retry !== false && workflow.steps.length < this.config.maxRetries) {
        log('info', `🔄 Retrying PR validation workflow: ${prDetails.prNumber}`);
        await this.delay(this.config.retryDelay);
        return await this.validatePR(prDetails, { ...options, retry: false });
      }
      
      throw error;
    } finally {
      // Cleanup
      this.activeWorkflows.delete(workflowId);
    }
  }

  async runPreValidationChecks(workflow, prDetails, options) {
    const step = {
      name: 'pre_validation_checks',
      startTime: new Date(),
      status: 'running'
    };
    
    workflow.steps.push(step);
    workflow.status = 'pre_validation';
    
    log('info', `🔍 Running pre-validation checks for PR ${prDetails.prNumber}`);
    
    try {
      // Validate PR details
      this.validatePRDetails(prDetails);
      
      // Check if PR is ready for validation
      await this.checkPRReadiness(prDetails);
      
      // Validate configuration
      this.validateWorkflowConfig(options);
      
      step.status = 'completed';
      step.endTime = new Date();
      step.duration = step.endTime - step.startTime;
      
      log('info', `✅ Pre-validation checks completed for PR ${prDetails.prNumber}`);
      
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      step.endTime = new Date();
      
      throw new Error(`Pre-validation checks failed: ${error.message}`);
    }
  }

  async runValidationStep(workflow, prDetails, options) {
    const step = {
      name: 'validation',
      startTime: new Date(),
      status: 'running'
    };
    
    workflow.steps.push(step);
    workflow.status = 'validating';
    
    log('info', `🤖 Running Claude Code validation for PR ${prDetails.prNumber}`);
    
    try {
      // Run the main validation through Claude Code integrator
      const validationResult = await this.claudeCodeIntegrator.validatePR(prDetails, {
        includeAnalysis: options.includeAnalysis !== false,
        includeDebugging: options.includeDebugging === true,
        customContext: options.context || {}
      });
      
      step.result = validationResult;
      step.status = 'completed';
      step.endTime = new Date();
      step.duration = step.endTime - step.startTime;
      
      log('info', `✅ Claude Code validation completed for PR ${prDetails.prNumber}`);
      
      return validationResult;
      
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      step.endTime = new Date();
      
      throw new Error(`Validation step failed: ${error.message}`);
    }
  }

  async runPostValidationProcessing(workflow, prDetails, options) {
    const step = {
      name: 'post_validation_processing',
      startTime: new Date(),
      status: 'running'
    };
    
    workflow.steps.push(step);
    workflow.status = 'post_processing';
    
    log('info', `⚙️ Running post-validation processing for PR ${prDetails.prNumber}`);
    
    try {
      const validationStep = workflow.steps.find(s => s.name === 'validation');
      if (!validationStep || !validationStep.result) {
        throw new Error('No validation results available for post-processing');
      }
      
      const validationResult = validationStep.result;
      
      // Process validation results
      const processedResults = await this.processValidationResults(validationResult, prDetails, options);
      
      // Apply business rules
      const businessRuleResults = await this.applyBusinessRules(processedResults, prDetails, options);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(businessRuleResults, prDetails, options);
      
      step.result = {
        processedResults,
        businessRuleResults,
        recommendations
      };
      
      step.status = 'completed';
      step.endTime = new Date();
      step.duration = step.endTime - step.startTime;
      
      log('info', `✅ Post-validation processing completed for PR ${prDetails.prNumber}`);
      
      return step.result;
      
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      step.endTime = new Date();
      
      throw new Error(`Post-validation processing failed: ${error.message}`);
    }
  }

  async generateFinalReport(workflow, prDetails, options) {
    const step = {
      name: 'final_report',
      startTime: new Date(),
      status: 'running'
    };
    
    workflow.steps.push(step);
    workflow.status = 'generating_report';
    
    log('info', `📋 Generating final report for PR ${prDetails.prNumber}`);
    
    try {
      // Collect all results from previous steps
      const validationStep = workflow.steps.find(s => s.name === 'validation');
      const postProcessingStep = workflow.steps.find(s => s.name === 'post_validation_processing');
      
      if (!validationStep?.result) {
        throw new Error('No validation results available for final report');
      }
      
      // Compile final workflow result
      const finalResult = {
        workflowId: workflow.id,
        prDetails,
        validation: validationStep.result,
        postProcessing: postProcessingStep?.result,
        workflow: {
          status: 'completed',
          startTime: workflow.startTime,
          steps: workflow.steps.map(s => ({
            name: s.name,
            status: s.status,
            duration: s.duration,
            error: s.error
          }))
        },
        summary: this.generateWorkflowSummary(workflow, validationStep.result),
        metadata: {
          generatedAt: new Date(),
          workflowVersion: '1.0.0',
          configUsed: this.sanitizeConfig(this.config)
        }
      };
      
      workflow.result = finalResult;
      
      step.result = finalResult;
      step.status = 'completed';
      step.endTime = new Date();
      step.duration = step.endTime - step.startTime;
      
      log('info', `✅ Final report generated for PR ${prDetails.prNumber}`);
      
      return finalResult;
      
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      step.endTime = new Date();
      
      throw new Error(`Final report generation failed: ${error.message}`);
    }
  }

  // Helper methods
  validatePRDetails(prDetails) {
    const requiredFields = ['prNumber', 'repository', 'headBranch'];
    
    for (const field of requiredFields) {
      if (!prDetails[field]) {
        throw new Error(`Missing required PR detail: ${field}`);
      }
    }
    
    if (!Array.isArray(prDetails.modifiedFiles)) {
      log('warn', 'No modified files provided in PR details');
      prDetails.modifiedFiles = [];
    }
  }

  async checkPRReadiness(prDetails) {
    // Check if PR is in a valid state for validation
    if (prDetails.state === 'closed') {
      throw new Error('Cannot validate closed PR');
    }
    
    if (prDetails.state === 'merged') {
      log('warn', 'Validating already merged PR');
    }
    
    // Additional readiness checks can be added here
    return true;
  }

  validateWorkflowConfig(options) {
    // Validate workflow-specific options
    if (options.timeout && options.timeout < 60000) {
      log('warn', 'Validation timeout is very low, may cause premature failures');
    }
    
    return true;
  }

  async processValidationResults(validationResult, prDetails, options) {
    log('info', '⚙️ Processing validation results...');
    
    // Extract and categorize issues
    const issues = this.categorizeValidationIssues(validationResult);
    
    // Calculate metrics
    const metrics = this.calculateValidationMetrics(validationResult);
    
    // Determine overall status
    const status = this.determineValidationStatus(issues, metrics);
    
    return {
      status,
      issues,
      metrics,
      rawValidation: validationResult
    };
  }

  async applyBusinessRules(processedResults, prDetails, options) {
    log('info', '📋 Applying business rules...');
    
    const rules = {
      blockingIssues: [],
      warnings: [],
      recommendations: []
    };
    
    // Apply critical issue rules
    if (processedResults.issues.critical.length > 0) {
      rules.blockingIssues.push({
        type: 'critical_issues',
        message: `${processedResults.issues.critical.length} critical issues must be resolved`,
        issues: processedResults.issues.critical
      });
    }
    
    // Apply security rules
    if (processedResults.issues.security.length > 0) {
      rules.blockingIssues.push({
        type: 'security_issues',
        message: 'Security vulnerabilities must be addressed',
        issues: processedResults.issues.security
      });
    }
    
    // Apply coverage rules
    if (processedResults.metrics.coverage < 70) {
      rules.warnings.push({
        type: 'low_coverage',
        message: `Test coverage (${processedResults.metrics.coverage}%) is below recommended threshold (70%)`,
        threshold: 70,
        actual: processedResults.metrics.coverage
      });
    }
    
    return rules;
  }

  async generateRecommendations(businessRuleResults, prDetails, options) {
    log('info', '💡 Generating recommendations...');
    
    const recommendations = [];
    
    // Generate recommendations based on business rules
    for (const blocking of businessRuleResults.blockingIssues) {
      recommendations.push({
        priority: 'critical',
        type: blocking.type,
        title: 'Address Blocking Issues',
        description: blocking.message,
        action: 'Fix all critical and security issues before merging'
      });
    }
    
    for (const warning of businessRuleResults.warnings) {
      recommendations.push({
        priority: 'medium',
        type: warning.type,
        title: 'Improve Code Quality',
        description: warning.message,
        action: 'Consider addressing these warnings to improve code quality'
      });
    }
    
    return recommendations;
  }

  categorizeValidationIssues(validationResult) {
    const issues = {
      critical: [],
      security: [],
      performance: [],
      style: [],
      other: []
    };
    
    if (validationResult.issues) {
      for (const issue of validationResult.issues) {
        const category = this.categorizeIssue(issue);
        if (issues[category]) {
          issues[category].push(issue);
        } else {
          issues.other.push(issue);
        }
      }
    }
    
    return issues;
  }

  categorizeIssue(issue) {
    const type = issue.type?.toLowerCase() || '';
    
    if (type.includes('security') || type.includes('vulnerability')) {
      return 'security';
    }
    if (type.includes('performance') || type.includes('optimization')) {
      return 'performance';
    }
    if (type.includes('style') || type.includes('format')) {
      return 'style';
    }
    if (issue.severity === 'error' || issue.severity === 'critical') {
      return 'critical';
    }
    
    return 'other';
  }

  calculateValidationMetrics(validationResult) {
    return {
      totalIssues: (validationResult.issues || []).length,
      criticalIssues: (validationResult.issues || []).filter(i => i.severity === 'error').length,
      warnings: (validationResult.issues || []).filter(i => i.severity === 'warning').length,
      suggestions: (validationResult.suggestions || []).length,
      coverage: validationResult.metrics?.coverage || 0,
      complexity: validationResult.metrics?.complexity || 0
    };
  }

  determineValidationStatus(issues, metrics) {
    if (issues.critical.length > 0 || issues.security.length > 0) {
      return 'failed';
    }
    if (issues.performance.length > 0 || metrics.coverage < 50) {
      return 'warning';
    }
    return 'passed';
  }

  generateWorkflowSummary(workflow, validationResult) {
    const totalSteps = workflow.steps.length;
    const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
    const failedSteps = workflow.steps.filter(s => s.status === 'failed').length;
    
    return {
      status: workflow.status,
      stepsCompleted: `${completedSteps}/${totalSteps}`,
      failedSteps,
      totalDuration: workflow.duration,
      validationPassed: validationResult?.success === true,
      issuesFound: (validationResult?.issues || []).length,
      suggestionsGenerated: (validationResult?.suggestions || []).length
    };
  }

  sanitizeConfig(config) {
    // Remove sensitive information from config for reporting
    const sanitized = { ...config };
    delete sanitized.apiKeys;
    delete sanitized.secrets;
    delete sanitized.credentials;
    return sanitized;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Status and monitoring methods
  getActiveWorkflows() {
    return Array.from(this.activeWorkflows.values());
  }

  getWorkflowById(id) {
    return this.activeWorkflows.get(id);
  }

  async cancelWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.status = 'cancelled';
      workflow.endTime = new Date();
      this.activeWorkflows.delete(workflowId);
      log('info', `🛑 Workflow cancelled: ${workflowId}`);
      return true;
    }
    return false;
  }

  async shutdown() {
    log('info', '🛑 Shutting down PR validation workflow...');
    
    // Cancel all active workflows
    for (const [workflowId, workflow] of this.activeWorkflows) {
      await this.cancelWorkflow(workflowId);
    }
    
    // Shutdown Claude Code integrator
    await this.claudeCodeIntegrator.shutdown();
    
    this.isInitialized = false;
    log('info', '✅ PR validation workflow shutdown complete');
  }
}

