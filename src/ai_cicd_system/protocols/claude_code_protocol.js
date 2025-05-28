/**
 * @fileoverview Claude Code Protocol
 * @description Claude Code protocol adapter and message formatting
 */

import { log } from '../utils/simple_logger.js';

/**
 * Claude Code Protocol - Handles Claude Code protocol specifics
 */
export class ClaudeCodeProtocol {
  constructor(config = {}) {
    this.config = config;
    this.version = '1.0.0';
    this.messageTypes = new Set([
      'validation_request',
      'validation_response',
      'code_review_request',
      'code_review_response',
      'debug_request',
      'debug_response',
      'optimization_request',
      'optimization_response'
    ]);
  }

  /**
   * Create validation request for Claude Code
   * @param {Object} codeData - Code data to validate
   * @param {Object} context - Validation context
   * @returns {Object} Claude Code validation request
   */
  createValidationRequest(codeData, context) {
    const request = {
      type: 'validation_request',
      id: context.requestId || `validation_${Date.now()}`,
      source_request_id: context.sourceRequestId,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        code_changes: codeData.codeChanges || [],
        files_created: codeData.filesCreated || [],
        files_modified: codeData.filesModified || [],
        files_deleted: codeData.filesDeleted || [],
        test_files: codeData.testFiles || [],
        documentation: codeData.documentation || [],
        
        repository: {
          name: context.repository?.name,
          url: context.repository?.url,
          branch: context.repository?.branch || 'main',
          commit_sha: context.repository?.commitSha,
          base_branch: context.repository?.baseBranch || 'main'
        },
        
        project_context: {
          language: context.project?.language,
          framework: context.project?.framework,
          build_system: context.project?.buildSystem,
          test_framework: context.project?.testFramework,
          linting_rules: context.project?.lintingRules || [],
          coding_standards: context.project?.codingStandards || []
        }
      },
      
      validation_config: {
        check_syntax: context.validation?.checkSyntax !== false,
        check_logic: context.validation?.checkLogic !== false,
        check_performance: context.validation?.checkPerformance !== false,
        check_security: context.validation?.checkSecurity !== false,
        check_style: context.validation?.checkStyle !== false,
        run_tests: context.validation?.runTests !== false,
        generate_report: context.validation?.generateReport !== false,
        
        thresholds: {
          min_test_coverage: context.validation?.minTestCoverage || 70,
          max_complexity: context.validation?.maxComplexity || 10,
          max_function_length: context.validation?.maxFunctionLength || 50,
          max_file_length: context.validation?.maxFileLength || 500
        }
      },
      
      context: {
        task: context.task,
        session: context.session,
        user_preferences: context.userPreferences || {},
        original_request: context.originalRequest
      },
      
      metadata: {
        source: 'agentapi-middleware',
        priority: context.priority || 'normal',
        timeout_ms: context.timeout || 300000, // 5 minutes
        trace_id: context.traceId
      }
    };
    
    this.validateRequest(request);
    return request;
  }

  /**
   * Create code review request
   * @param {Object} codeData - Code data to review
   * @param {Object} context - Review context
   * @returns {Object} Claude Code review request
   */
  createCodeReviewRequest(codeData, context) {
    const request = {
      type: 'code_review_request',
      id: context.requestId || `review_${Date.now()}`,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        files_to_review: codeData.filesToReview || [],
        diff_data: codeData.diffData || [],
        pull_request: codeData.pullRequest || {},
        
        review_scope: {
          check_logic: context.review?.checkLogic !== false,
          check_performance: context.review?.checkPerformance !== false,
          check_security: context.review?.checkSecurity !== false,
          check_best_practices: context.review?.checkBestPractices !== false,
          check_documentation: context.review?.checkDocumentation !== false,
          suggest_improvements: context.review?.suggestImprovements !== false
        },
        
        context: {
          repository: context.repository,
          project: context.project,
          author: context.author,
          reviewers: context.reviewers || []
        }
      },
      
      metadata: {
        source: 'agentapi-middleware',
        review_type: context.reviewType || 'comprehensive',
        trace_id: context.traceId
      }
    };
    
    return request;
  }

  /**
   * Create debug request
   * @param {Object} debugData - Debug data
   * @param {Object} context - Debug context
   * @returns {Object} Claude Code debug request
   */
  createDebugRequest(debugData, context) {
    const request = {
      type: 'debug_request',
      id: context.requestId || `debug_${Date.now()}`,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        error_data: {
          error_message: debugData.errorMessage,
          stack_trace: debugData.stackTrace,
          error_type: debugData.errorType,
          error_code: debugData.errorCode
        },
        
        code_context: {
          files: debugData.files || [],
          line_numbers: debugData.lineNumbers || [],
          function_context: debugData.functionContext || []
        },
        
        environment: {
          runtime: debugData.runtime || 'node',
          version: debugData.version,
          dependencies: debugData.dependencies || [],
          configuration: debugData.configuration || {}
        },
        
        reproduction_steps: debugData.reproductionSteps || [],
        expected_behavior: debugData.expectedBehavior,
        actual_behavior: debugData.actualBehavior
      },
      
      debug_config: {
        analyze_root_cause: context.debug?.analyzeRootCause !== false,
        suggest_fixes: context.debug?.suggestFixes !== false,
        provide_examples: context.debug?.provideExamples !== false,
        check_related_issues: context.debug?.checkRelatedIssues !== false
      },
      
      metadata: {
        source: 'agentapi-middleware',
        severity: context.severity || 'medium',
        trace_id: context.traceId
      }
    };
    
    return request;
  }

  /**
   * Parse Claude Code response
   * @param {Object} response - Raw Claude Code response
   * @returns {Object} Parsed response
   */
  parseResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid Claude Code response format');
    }
    
    this.validateResponse(response);
    
    const parsed = {
      id: response.id,
      type: response.type,
      validationId: response.validation_id || response.id,
      timestamp: new Date(response.timestamp),
      
      success: response.status === 'success' || response.success === true,
      status: response.status,
      
      // Validation results
      results: response.results || {},
      issues: response.issues || [],
      suggestions: response.suggestions || [],
      fixes: response.fixes || [],
      
      // Metrics
      metrics: response.metrics || {},
      duration: response.duration || 0,
      
      // Test results
      testResults: response.test_results || {},
      testCoverage: response.test_coverage || 0,
      
      // Code quality
      codeQualityScore: response.code_quality_score || 0,
      performanceScore: response.performance_score || 0,
      securityScore: response.security_score || 0,
      
      // Files
      modifiedFiles: response.modified_files || [],
      createdFiles: response.created_files || [],
      deletedFiles: response.deleted_files || [],
      
      // PR information
      prTitle: response.pr_title,
      prDescription: response.pr_description,
      targetBranch: response.target_branch,
      
      // Environment
      environment: response.environment || 'unknown',
      
      // Metadata
      metadata: response.metadata || {},
      traceId: response.trace_id
    };
    
    // Add convenience methods
    parsed.hasIssues = () => parsed.issues.length > 0;
    parsed.hasSuggestions = () => parsed.suggestions.length > 0;
    parsed.hasFixesApplied = () => parsed.fixes.length > 0;
    parsed.isValidationPassed = () => parsed.success && !parsed.hasIssues();
    
    return parsed;
  }

  /**
   * Format validation response for AgentAPI
   * @param {Object} claudeResponse - Claude Code response
   * @param {Object} context - Response context
   * @returns {Object} Formatted response for AgentAPI
   */
  formatForAgentAPI(claudeResponse, context) {
    const parsed = this.parseResponse(claudeResponse);
    
    return {
      type: 'validation_result',
      id: `result_${Date.now()}`,
      validation_id: parsed.validationId,
      source_request_id: context.sourceRequestId,
      timestamp: new Date().toISOString(),
      
      payload: {
        validation_status: parsed.success ? 'passed' : 'failed',
        
        summary: {
          total_issues: parsed.issues.length,
          critical_issues: parsed.issues.filter(i => i.severity === 'critical').length,
          high_issues: parsed.issues.filter(i => i.severity === 'high').length,
          medium_issues: parsed.issues.filter(i => i.severity === 'medium').length,
          low_issues: parsed.issues.filter(i => i.severity === 'low').length,
          
          suggestions_count: parsed.suggestions.length,
          fixes_applied: parsed.fixes.length,
          
          test_coverage: parsed.testCoverage,
          code_quality_score: parsed.codeQualityScore,
          performance_score: parsed.performanceScore,
          security_score: parsed.securityScore
        },
        
        details: {
          issues: parsed.issues,
          suggestions: parsed.suggestions,
          fixes_applied: parsed.fixes,
          test_results: parsed.testResults,
          metrics: parsed.metrics
        },
        
        files: {
          modified: parsed.modifiedFiles,
          created: parsed.createdFiles,
          deleted: parsed.deletedFiles
        },
        
        next_steps: this.determineNextSteps(parsed)
      },
      
      metadata: {
        source: 'claude-code',
        validation_duration_ms: parsed.duration,
        environment: parsed.environment,
        trace_id: parsed.traceId
      }
    };
  }

  /**
   * Validate request format
   * @param {Object} request - Request to validate
   * @throws {Error} If request is invalid
   */
  validateRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new Error('Request must be an object');
    }
    
    if (!request.type || !this.messageTypes.has(request.type)) {
      throw new Error(`Invalid or missing request type: ${request.type}`);
    }
    
    if (!request.id) {
      throw new Error('Request must have an ID');
    }
    
    if (!request.payload) {
      throw new Error('Request must have a payload');
    }
    
    // Type-specific validation
    switch (request.type) {
      case 'validation_request':
        this.validateValidationRequest(request);
        break;
      
      case 'code_review_request':
        this.validateCodeReviewRequest(request);
        break;
      
      case 'debug_request':
        this.validateDebugRequest(request);
        break;
    }
  }

  /**
   * Validate validation request
   * @param {Object} request - Request to validate
   * @throws {Error} If request is invalid
   */
  validateValidationRequest(request) {
    const { payload } = request;
    
    if (!payload.code_changes && !payload.files_created && !payload.files_modified) {
      throw new Error('Validation request must have code changes or files');
    }
    
    if (!request.validation_config) {
      throw new Error('Validation request must have validation config');
    }
  }

  /**
   * Validate code review request
   * @param {Object} request - Request to validate
   * @throws {Error} If request is invalid
   */
  validateCodeReviewRequest(request) {
    const { payload } = request;
    
    if (!payload.files_to_review || payload.files_to_review.length === 0) {
      throw new Error('Code review request must have files to review');
    }
    
    if (!payload.review_scope) {
      throw new Error('Code review request must have review scope');
    }
  }

  /**
   * Validate debug request
   * @param {Object} request - Request to validate
   * @throws {Error} If request is invalid
   */
  validateDebugRequest(request) {
    const { payload } = request;
    
    if (!payload.error_data || !payload.error_data.error_message) {
      throw new Error('Debug request must have error data with error message');
    }
    
    if (!payload.code_context) {
      throw new Error('Debug request must have code context');
    }
  }

  /**
   * Validate response format
   * @param {Object} response - Response to validate
   * @throws {Error} If response is invalid
   */
  validateResponse(response) {
    if (!response.id) {
      throw new Error('Response must have an ID');
    }
    
    if (!response.type) {
      throw new Error('Response must have a type');
    }
    
    if (!response.timestamp) {
      throw new Error('Response must have a timestamp');
    }
    
    if (response.status && !['success', 'failed', 'pending', 'error'].includes(response.status)) {
      throw new Error(`Invalid response status: ${response.status}`);
    }
  }

  /**
   * Determine next steps based on validation result
   * @param {Object} validationResult - Parsed validation result
   * @returns {Array} Array of next steps
   */
  determineNextSteps(validationResult) {
    const steps = [];
    
    if (!validationResult.success) {
      const criticalIssues = validationResult.issues.filter(i => i.severity === 'critical');
      const highIssues = validationResult.issues.filter(i => i.severity === 'high');
      
      if (criticalIssues.length > 0) {
        steps.push({
          action: 'fix_critical_issues',
          priority: 'immediate',
          description: `Fix ${criticalIssues.length} critical issues`,
          issues: criticalIssues
        });
      }
      
      if (highIssues.length > 0) {
        steps.push({
          action: 'fix_high_priority_issues',
          priority: 'high',
          description: `Fix ${highIssues.length} high priority issues`,
          issues: highIssues
        });
      }
      
      if (validationResult.suggestions.length > 0) {
        steps.push({
          action: 'apply_suggestions',
          priority: 'medium',
          description: `Apply ${validationResult.suggestions.length} suggestions`,
          suggestions: validationResult.suggestions
        });
      }
      
      if (validationResult.testCoverage < 70) {
        steps.push({
          action: 'improve_test_coverage',
          priority: 'medium',
          description: `Improve test coverage from ${validationResult.testCoverage}% to 70%+`,
          current_coverage: validationResult.testCoverage,
          target_coverage: 70
        });
      }
      
    } else {
      steps.push({
        action: 'create_pull_request',
        priority: 'high',
        description: 'Create pull request with validated changes',
        pr_data: {
          title: validationResult.prTitle || 'Automated code changes',
          description: validationResult.prDescription || 'Changes validated by Claude Code',
          files: validationResult.modifiedFiles,
          target_branch: validationResult.targetBranch || 'main'
        }
      });
      
      if (validationResult.codeQualityScore < 80) {
        steps.push({
          action: 'optimize_code_quality',
          priority: 'low',
          description: `Optimize code quality score from ${validationResult.codeQualityScore} to 80+`,
          current_score: validationResult.codeQualityScore,
          target_score: 80
        });
      }
    }
    
    return steps;
  }

  /**
   * Get protocol information
   * @returns {Object} Protocol information
   */
  getProtocolInfo() {
    return {
      name: 'Claude Code Protocol',
      version: this.version,
      supported_message_types: Array.from(this.messageTypes),
      features: [
        'code_validation',
        'code_review',
        'debugging_assistance',
        'performance_optimization',
        'security_analysis',
        'test_coverage_analysis'
      ]
    };
  }
}

export default ClaudeCodeProtocol;

