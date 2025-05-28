/**
 * @fileoverview Validation Pipeline
 * @description Orchestrates the complete PR validation workflow
 */

import { log } from '../../scripts/modules/utils.js';
import { ValidationStatus, IssueSeverity } from '../database/models/validation.js';

/**
 * Validation Pipeline
 * Orchestrates the complete validation workflow for PRs
 */
export class ValidationPipeline {
  constructor(config = {}) {
    this.analyzer = config.analyzer;
    this.codegenClient = config.codegenClient;
    this.statusReporter = config.statusReporter;
    
    this.config = {
      enableParallelAnalysis: config.enableParallelAnalysis !== false,
      maxAnalysisTime: config.maxAnalysisTime || 300000, // 5 minutes
      enableAutoFix: config.enableAutoFix !== false,
      criticalIssueThreshold: config.criticalIssueThreshold || 1,
      ...config
    };
  }

  /**
   * Execute the complete validation pipeline
   * @param {PRValidation} validation - Validation instance
   * @param {Object} pullRequest - GitHub PR object
   * @returns {Promise<Object>} Validation results
   */
  async execute(validation, pullRequest) {
    const startTime = Date.now();
    
    try {
      log('info', `Starting validation pipeline`, {
        validation_id: validation.id,
        pr_number: validation.pr_number,
        repository: validation.repository
      });

      // Update status to running
      await validation.updateStatus(ValidationStatus.RUNNING);
      
      // Report initial status to GitHub
      await this.statusReporter.reportStatus(pullRequest, {
        state: 'pending',
        description: 'Starting PR validation...',
        context: 'codegen/pr-validation'
      });

      // Step 1: Analyze PR changes
      const analysis = await this.analyzePRChanges(validation, pullRequest);
      
      // Step 2: Detect issues
      const issues = await this.detectIssues(validation, analysis);
      
      // Step 3: Evaluate severity and determine next steps
      const evaluation = await this.evaluateIssues(validation, issues);
      
      // Step 4: Handle issues based on severity
      const resolution = await this.handleIssues(validation, pullRequest, evaluation);
      
      // Step 5: Generate final report
      const report = await this.generateReport(validation, analysis, issues, resolution);
      
      // Step 6: Update final status
      await this.updateFinalStatus(validation, pullRequest, report);
      
      const totalTime = Date.now() - startTime;
      
      log('info', `Validation pipeline completed`, {
        validation_id: validation.id,
        pr_number: validation.pr_number,
        total_time_ms: totalTime,
        issues_found: issues.length,
        final_status: validation.status
      });

      return report;
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      log('error', 'Validation pipeline failed', {
        validation_id: validation.id,
        pr_number: validation.pr_number,
        error: error.message,
        total_time_ms: totalTime
      });

      await validation.updateStatus(ValidationStatus.FAILED, {
        error_message: error.message,
        failed_at: new Date().toISOString()
      });

      await this.statusReporter.reportStatus(pullRequest, {
        state: 'error',
        description: `Validation failed: ${error.message}`,
        context: 'codegen/pr-validation'
      });

      throw error;
    }
  }

  /**
   * Analyze PR changes
   * @param {PRValidation} validation - Validation instance
   * @param {Object} pullRequest - GitHub PR object
   * @returns {Promise<Object>} Analysis results
   */
  async analyzePRChanges(validation, pullRequest) {
    log('info', 'Analyzing PR changes', {
      validation_id: validation.id,
      pr_number: validation.pr_number
    });

    try {
      const analysis = await this.analyzer.analyzePRChanges(pullRequest);
      
      await validation.setResults({
        analysis: analysis,
        analysis_completed_at: new Date().toISOString()
      });

      await this.statusReporter.reportStatus(pullRequest, {
        state: 'pending',
        description: `Analyzed ${analysis.files.total} files, ${analysis.files.totalChanges} changes`,
        context: 'codegen/pr-validation'
      });

      return analysis;
      
    } catch (error) {
      log('error', 'Failed to analyze PR changes', {
        validation_id: validation.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Detect issues in the analysis
   * @param {PRValidation} validation - Validation instance
   * @param {Object} analysis - Analysis results
   * @returns {Promise<Array>} Detected issues
   */
  async detectIssues(validation, analysis) {
    log('info', 'Detecting issues', {
      validation_id: validation.id,
      files_analyzed: analysis.files.total
    });

    try {
      const issues = await this.analyzer.detectIssues(analysis);
      
      await validation.addIssues(issues);

      log('info', 'Issues detected', {
        validation_id: validation.id,
        total_issues: issues.length,
        critical: issues.filter(i => i.severity === IssueSeverity.CRITICAL).length,
        high: issues.filter(i => i.severity === IssueSeverity.HIGH).length,
        medium: issues.filter(i => i.severity === IssueSeverity.MEDIUM).length,
        low: issues.filter(i => i.severity === IssueSeverity.LOW).length
      });

      return issues;
      
    } catch (error) {
      log('error', 'Failed to detect issues', {
        validation_id: validation.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Evaluate issues and determine severity
   * @param {PRValidation} validation - Validation instance
   * @param {Array} issues - Detected issues
   * @returns {Promise<Object>} Issue evaluation
   */
  async evaluateIssues(validation, issues) {
    const evaluation = {
      total: issues.length,
      critical: issues.filter(i => i.severity === IssueSeverity.CRITICAL).length,
      high: issues.filter(i => i.severity === IssueSeverity.HIGH).length,
      medium: issues.filter(i => i.severity === IssueSeverity.MEDIUM).length,
      low: issues.filter(i => i.severity === IssueSeverity.LOW).length,
      blocking: false,
      requiresCodegenAnalysis: false,
      autoFixable: [],
      manualReview: []
    };

    // Determine if issues are blocking
    evaluation.blocking = evaluation.critical >= this.config.criticalIssueThreshold;

    // Determine if Codegen analysis is needed
    evaluation.requiresCodegenAnalysis = evaluation.critical > 0 || evaluation.high > 2;

    // Categorize issues by fixability
    issues.forEach(issue => {
      if (this.isAutoFixable(issue)) {
        evaluation.autoFixable.push(issue);
      } else {
        evaluation.manualReview.push(issue);
      }
    });

    log('info', 'Issue evaluation completed', {
      validation_id: validation.id,
      ...evaluation
    });

    return evaluation;
  }

  /**
   * Handle issues based on evaluation
   * @param {PRValidation} validation - Validation instance
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} evaluation - Issue evaluation
   * @returns {Promise<Object>} Resolution results
   */
  async handleIssues(validation, pullRequest, evaluation) {
    const resolution = {
      strategy: 'none',
      actions: [],
      codegenAnalysisRequested: false,
      autoFixesApplied: [],
      commentsPosted: []
    };

    try {
      if (evaluation.total === 0) {
        resolution.strategy = 'pass';
        log('info', 'No issues found, validation passed', {
          validation_id: validation.id
        });
        return resolution;
      }

      if (evaluation.blocking) {
        resolution.strategy = 'block';
        
        await this.statusReporter.reportStatus(pullRequest, {
          state: 'failure',
          description: `Blocking issues found: ${evaluation.critical} critical, ${evaluation.high} high`,
          context: 'codegen/pr-validation'
        });

        // Post detailed comment about blocking issues
        await this.postBlockingIssuesComment(pullRequest, evaluation);
        resolution.commentsPosted.push('blocking_issues');
      }

      if (evaluation.requiresCodegenAnalysis && this.config.enableAutoFix) {
        resolution.strategy = 'codegen_analysis';
        resolution.codegenAnalysisRequested = true;
        
        await this.requestCodegenAnalysis(validation, evaluation);
        
        await this.statusReporter.reportStatus(pullRequest, {
          state: 'pending',
          description: 'Requesting automated analysis and fixes...',
          context: 'codegen/pr-validation'
        });
      }

      // Apply auto-fixes if available
      if (evaluation.autoFixable.length > 0 && this.config.enableAutoFix) {
        const autoFixes = await this.applyAutoFixes(validation, pullRequest, evaluation.autoFixable);
        resolution.autoFixesApplied = autoFixes;
      }

      // Post review comments for manual issues
      if (evaluation.manualReview.length > 0) {
        await this.postReviewComments(pullRequest, evaluation.manualReview);
        resolution.commentsPosted.push('review_comments');
      }

      return resolution;
      
    } catch (error) {
      log('error', 'Failed to handle issues', {
        validation_id: validation.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate validation report
   * @param {PRValidation} validation - Validation instance
   * @param {Object} analysis - Analysis results
   * @param {Array} issues - Detected issues
   * @param {Object} resolution - Resolution results
   * @returns {Promise<Object>} Validation report
   */
  async generateReport(validation, analysis, issues, resolution) {
    const report = {
      validation_id: validation.id,
      pr_number: validation.pr_number,
      repository: validation.repository,
      status: validation.status,
      summary: {
        files_analyzed: analysis.files.total,
        changes: analysis.files.totalChanges,
        complexity_score: analysis.complexity.score,
        risk_score: analysis.riskScore,
        issues_found: issues.length,
        critical_issues: issues.filter(i => i.severity === IssueSeverity.CRITICAL).length,
        high_issues: issues.filter(i => i.severity === IssueSeverity.HIGH).length
      },
      analysis: analysis,
      issues: issues,
      resolution: resolution,
      recommendations: this.generateRecommendations(analysis, issues, resolution),
      generated_at: new Date().toISOString()
    };

    await validation.setResults({
      ...validation.validation_results,
      final_report: report
    });

    return report;
  }

  /**
   * Update final validation status
   * @param {PRValidation} validation - Validation instance
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} report - Validation report
   */
  async updateFinalStatus(validation, pullRequest, report) {
    let finalStatus = ValidationStatus.PASSED;
    let statusDescription = 'All validations passed';
    let githubState = 'success';

    if (report.resolution.strategy === 'block') {
      finalStatus = ValidationStatus.FAILED;
      statusDescription = `Validation failed: ${report.summary.critical_issues} critical issues`;
      githubState = 'failure';
    } else if (report.resolution.strategy === 'codegen_analysis') {
      finalStatus = ValidationStatus.CODEGEN_ANALYSIS_REQUESTED;
      statusDescription = 'Automated analysis requested';
      githubState = 'pending';
    } else if (report.summary.issues_found > 0) {
      finalStatus = ValidationStatus.PASSED;
      statusDescription = `Validation passed with ${report.summary.issues_found} minor issues`;
      githubState = 'success';
    }

    await validation.updateStatus(finalStatus, {
      completed_at: new Date().toISOString()
    });

    await this.statusReporter.reportStatus(pullRequest, {
      state: githubState,
      description: statusDescription,
      context: 'codegen/pr-validation',
      target_url: this.generateReportUrl(validation.id)
    });
  }

  /**
   * Request Codegen analysis
   * @param {PRValidation} validation - Validation instance
   * @param {Object} evaluation - Issue evaluation
   */
  async requestCodegenAnalysis(validation, evaluation) {
    const analysisRequest = {
      type: 'pr_validation',
      pr_number: validation.pr_number,
      repository: validation.repository,
      issues: evaluation.manualReview,
      context: {
        validation_id: validation.id,
        webhook_payload: validation.webhook_payload,
        critical_issues: evaluation.critical,
        high_issues: evaluation.high
      },
      priority: evaluation.critical > 0 ? 'high' : 'normal'
    };

    const response = await this.codegenClient.requestAnalysis(analysisRequest);
    
    await validation.updateStatus(ValidationStatus.CODEGEN_ANALYSIS_REQUESTED, {
      codegen_analysis_id: response.analysis_id
    });

    log('info', 'Codegen analysis requested', {
      validation_id: validation.id,
      analysis_id: response.analysis_id,
      issues_count: evaluation.manualReview.length
    });
  }

  /**
   * Apply automatic fixes
   * @param {PRValidation} validation - Validation instance
   * @param {Object} pullRequest - GitHub PR object
   * @param {Array} autoFixableIssues - Issues that can be auto-fixed
   * @returns {Promise<Array>} Applied fixes
   */
  async applyAutoFixes(validation, pullRequest, autoFixableIssues) {
    const appliedFixes = [];

    for (const issue of autoFixableIssues) {
      try {
        const fix = await this.generateAutoFix(issue);
        if (fix) {
          appliedFixes.push({
            issue: issue,
            fix: fix,
            applied_at: new Date().toISOString()
          });
        }
      } catch (error) {
        log('error', 'Failed to apply auto-fix', {
          validation_id: validation.id,
          issue_type: issue.type,
          error: error.message
        });
      }
    }

    if (appliedFixes.length > 0) {
      log('info', 'Auto-fixes applied', {
        validation_id: validation.id,
        fixes_count: appliedFixes.length
      });
    }

    return appliedFixes;
  }

  /**
   * Post blocking issues comment
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} evaluation - Issue evaluation
   */
  async postBlockingIssuesComment(pullRequest, evaluation) {
    const comment = this.generateBlockingIssuesComment(evaluation);
    await this.statusReporter.postComment(pullRequest, comment);
  }

  /**
   * Post review comments for issues
   * @param {Object} pullRequest - GitHub PR object
   * @param {Array} issues - Issues requiring manual review
   */
  async postReviewComments(pullRequest, issues) {
    for (const issue of issues) {
      if (issue.details?.file && issue.details?.line) {
        await this.statusReporter.postReviewComment(pullRequest, {
          path: issue.details.file,
          line: issue.details.line,
          body: this.generateIssueComment(issue)
        });
      }
    }
  }

  /**
   * Check if an issue is auto-fixable
   * @param {Object} issue - Issue object
   * @returns {boolean} True if auto-fixable
   */
  isAutoFixable(issue) {
    const autoFixableTypes = [
      'code_quality',
      'missing_documentation'
    ];
    
    return autoFixableTypes.includes(issue.type) && 
           issue.severity !== IssueSeverity.CRITICAL;
  }

  /**
   * Generate auto-fix for an issue
   * @param {Object} issue - Issue object
   * @returns {Promise<Object|null>} Fix object or null
   */
  async generateAutoFix(issue) {
    // This would contain logic to generate automatic fixes
    // For now, return null (no auto-fixes implemented)
    return null;
  }

  /**
   * Generate recommendations
   * @param {Object} analysis - Analysis results
   * @param {Array} issues - Detected issues
   * @param {Object} resolution - Resolution results
   * @returns {Array} Recommendations
   */
  generateRecommendations(analysis, issues, resolution) {
    const recommendations = [];

    if (analysis.complexity.score > 8) {
      recommendations.push({
        type: 'complexity',
        message: 'Consider breaking down complex changes into smaller PRs',
        priority: 'medium'
      });
    }

    if (analysis.files.total > 20) {
      recommendations.push({
        type: 'scope',
        message: 'Large PR detected - consider splitting into focused changes',
        priority: 'low'
      });
    }

    if (issues.some(i => i.type === 'missing_tests')) {
      recommendations.push({
        type: 'testing',
        message: 'Add tests for new functionality to improve code coverage',
        priority: 'high'
      });
    }

    return recommendations;
  }

  /**
   * Generate blocking issues comment
   * @param {Object} evaluation - Issue evaluation
   * @returns {string} Comment text
   */
  generateBlockingIssuesComment(evaluation) {
    return `## 🚫 Validation Failed - Blocking Issues Detected

This PR has **${evaluation.critical} critical** and **${evaluation.high} high** severity issues that must be addressed before merging.

### Critical Issues (${evaluation.critical})
${evaluation.critical > 0 ? '- Issues require immediate attention' : 'None'}

### High Severity Issues (${evaluation.high})
${evaluation.high > 0 ? '- Issues should be resolved before merging' : 'None'}

Please review the detailed feedback and address these issues. You can request automated analysis by commenting \`@codegen analyze\`.`;
  }

  /**
   * Generate issue comment
   * @param {Object} issue - Issue object
   * @returns {string} Comment text
   */
  generateIssueComment(issue) {
    return `**${issue.severity.toUpperCase()}**: ${issue.message}

${issue.details?.suggestion ? `💡 **Suggestion**: ${issue.details.suggestion}` : ''}`;
  }

  /**
   * Generate report URL
   * @param {string} validationId - Validation ID
   * @returns {string} Report URL
   */
  generateReportUrl(validationId) {
    return `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/validations/${validationId}`;
  }
}

export default ValidationPipeline;

