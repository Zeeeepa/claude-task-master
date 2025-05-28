/**
 * @fileoverview Agent Protocol
 * @description AgentAPI protocol implementation and message formatting
 */

import { log } from '../utils/simple_logger.js';

/**
 * Agent Protocol - Handles AgentAPI protocol specifics
 */
export class AgentProtocol {
  constructor(config = {}) {
    this.config = config;
    this.version = '1.0.0';
    this.messageTypes = new Set([
      'code_generation_request',
      'validation_update',
      'health_check',
      'session_create',
      'session_update',
      'task_status',
      'error_report'
    ]);
  }

  /**
   * Create code generation request
   * @param {Object} task - Task object
   * @param {Object} context - Request context
   * @returns {Object} AgentAPI request
   */
  createCodeGenerationRequest(task, context) {
    const request = {
      type: 'code_generation_request',
      id: context.requestId || `req_${Date.now()}`,
      session_id: context.sessionId,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          requirements: task.requirements || [],
          acceptance_criteria: task.acceptanceCriteria || [],
          complexity: task.complexityScore || 5,
          priority: task.priority || 'medium',
          files_affected: task.affectedFiles || [],
          dependencies: task.dependencies || []
        },
        
        context: {
          repository: {
            name: context.repository?.name,
            url: context.repository?.url,
            branch: context.repository?.branch || 'main',
            commit_sha: context.repository?.commitSha
          },
          
          project: {
            language: context.project?.language,
            framework: context.project?.framework,
            build_system: context.project?.buildSystem,
            test_framework: context.project?.testFramework
          },
          
          user: {
            id: context.user?.id,
            preferences: context.user?.preferences || {}
          },
          
          environment: {
            os: context.environment?.os || 'linux',
            node_version: context.environment?.nodeVersion,
            python_version: context.environment?.pythonVersion
          }
        },
        
        options: {
          generate_tests: context.options?.generateTests !== false,
          include_documentation: context.options?.includeDocumentation !== false,
          follow_conventions: context.options?.followConventions !== false,
          optimize_performance: context.options?.optimizePerformance !== false,
          security_scan: context.options?.securityScan !== false,
          code_style: context.options?.codeStyle || 'standard'
        }
      },
      
      metadata: {
        source: 'claude-task-master',
        source_version: '1.0.0',
        client_id: context.clientId,
        trace_id: context.traceId
      }
    };
    
    this.validateRequest(request);
    return request;
  }

  /**
   * Create validation update
   * @param {Object} validationResult - Validation result
   * @param {Object} context - Update context
   * @returns {Object} AgentAPI update
   */
  createValidationUpdate(validationResult, context) {
    const update = {
      type: 'validation_update',
      id: `update_${Date.now()}`,
      session_id: context.sessionId,
      validation_id: validationResult.validationId,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        validation_status: validationResult.success ? 'passed' : 'failed',
        
        results: {
          syntax_check: validationResult.syntaxCheck || { passed: true, issues: [] },
          logic_check: validationResult.logicCheck || { passed: true, issues: [] },
          performance_check: validationResult.performanceCheck || { passed: true, issues: [] },
          security_check: validationResult.securityCheck || { passed: true, issues: [] },
          test_results: validationResult.testResults || { passed: true, coverage: 0 }
        },
        
        issues: validationResult.issues || [],
        suggestions: validationResult.suggestions || [],
        fixes_applied: validationResult.fixesApplied || [],
        
        metrics: {
          validation_duration_ms: validationResult.duration || 0,
          code_quality_score: validationResult.codeQualityScore || 0,
          test_coverage_percent: validationResult.testCoverage || 0,
          performance_score: validationResult.performanceScore || 0,
          security_score: validationResult.securityScore || 0
        }
      },
      
      next_actions: this.determineNextActions(validationResult),
      
      metadata: {
        source: 'claude-code',
        validation_environment: validationResult.environment || 'unknown',
        trace_id: context.traceId
      }
    };
    
    this.validateUpdate(update);
    return update;
  }

  /**
   * Create health check request
   * @returns {Object} Health check request
   */
  createHealthCheck() {
    return {
      type: 'health_check',
      id: `health_${Date.now()}`,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        check_type: 'basic',
        components: ['api', 'database', 'queue', 'storage']
      },
      
      metadata: {
        source: 'claude-task-master'
      }
    };
  }

  /**
   * Create session management request
   * @param {string} action - Session action (create, update, close)
   * @param {Object} sessionData - Session data
   * @returns {Object} Session request
   */
  createSessionRequest(action, sessionData) {
    const request = {
      type: `session_${action}`,
      id: `session_${action}_${Date.now()}`,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        session_id: sessionData.sessionId,
        action: action,
        data: sessionData
      },
      
      metadata: {
        source: 'claude-task-master'
      }
    };
    
    return request;
  }

  /**
   * Create error report
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   * @returns {Object} Error report
   */
  createErrorReport(error, context) {
    return {
      type: 'error_report',
      id: `error_${Date.now()}`,
      version: this.version,
      timestamp: new Date().toISOString(),
      
      payload: {
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
          type: error.constructor.name
        },
        
        context: {
          operation: context.operation,
          request_id: context.requestId,
          session_id: context.sessionId,
          user_id: context.userId
        },
        
        environment: {
          node_version: process.version,
          platform: process.platform,
          memory_usage: process.memoryUsage()
        }
      },
      
      metadata: {
        source: 'claude-task-master',
        severity: this.determineSeverity(error),
        trace_id: context.traceId
      }
    };
  }

  /**
   * Parse AgentAPI response
   * @param {Object} response - Raw response
   * @returns {Object} Parsed response
   */
  parseResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid AgentAPI response format');
    }
    
    // Validate response structure
    this.validateResponse(response);
    
    return {
      id: response.id,
      type: response.type,
      status: response.status || 'unknown',
      timestamp: new Date(response.timestamp),
      
      payload: response.payload || {},
      metadata: response.metadata || {},
      
      // Parsed fields for easier access
      isSuccess: response.status === 'success' || response.status === 'completed',
      isError: response.status === 'error' || response.status === 'failed',
      
      // Extract common fields
      requestId: response.request_id || response.id,
      sessionId: response.session_id,
      
      // Response-specific data
      codeChanges: response.payload?.code_changes || [],
      filesCreated: response.payload?.files_created || [],
      filesModified: response.payload?.files_modified || [],
      testFiles: response.payload?.test_files || [],
      documentation: response.payload?.documentation || []
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
    
    if (!request.timestamp) {
      throw new Error('Request must have a timestamp');
    }
    
    if (!request.payload) {
      throw new Error('Request must have a payload');
    }
    
    // Type-specific validation
    switch (request.type) {
      case 'code_generation_request':
        this.validateCodeGenerationRequest(request);
        break;
      
      case 'validation_update':
        this.validateValidationUpdate(request);
        break;
    }
  }

  /**
   * Validate code generation request
   * @param {Object} request - Request to validate
   * @throws {Error} If request is invalid
   */
  validateCodeGenerationRequest(request) {
    const { payload } = request;
    
    if (!payload.task) {
      throw new Error('Code generation request must have task data');
    }
    
    if (!payload.task.id || !payload.task.title) {
      throw new Error('Task must have ID and title');
    }
    
    if (!payload.context) {
      throw new Error('Code generation request must have context');
    }
  }

  /**
   * Validate validation update
   * @param {Object} update - Update to validate
   * @throws {Error} If update is invalid
   */
  validateValidationUpdate(update) {
    const { payload } = update;
    
    if (!payload.validation_status) {
      throw new Error('Validation update must have status');
    }
    
    if (!['passed', 'failed', 'pending'].includes(payload.validation_status)) {
      throw new Error('Invalid validation status');
    }
    
    if (!update.validation_id) {
      throw new Error('Validation update must have validation ID');
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
  }

  /**
   * Determine next actions based on validation result
   * @param {Object} validationResult - Validation result
   * @returns {Array} Array of next actions
   */
  determineNextActions(validationResult) {
    const actions = [];
    
    if (!validationResult.success) {
      if (validationResult.issues && validationResult.issues.length > 0) {
        actions.push({
          type: 'fix_issues',
          priority: 'high',
          data: {
            issues: validationResult.issues,
            auto_fixable: validationResult.issues.filter(i => i.autoFixable).length
          }
        });
      }
      
      if (validationResult.suggestions && validationResult.suggestions.length > 0) {
        actions.push({
          type: 'apply_suggestions',
          priority: 'medium',
          data: {
            suggestions: validationResult.suggestions
          }
        });
      }
      
      actions.push({
        type: 'retry_validation',
        priority: 'low',
        data: {
          retry_count: (validationResult.retryCount || 0) + 1,
          max_retries: 3
        }
      });
      
    } else {
      actions.push({
        type: 'create_pr',
        priority: 'high',
        data: {
          title: validationResult.prTitle || 'Automated code generation',
          description: validationResult.prDescription || 'Generated by AI CI/CD system',
          files: validationResult.modifiedFiles || [],
          branch: validationResult.targetBranch || 'feature/automated-changes'
        }
      });
      
      if (validationResult.testCoverage && validationResult.testCoverage < 80) {
        actions.push({
          type: 'improve_test_coverage',
          priority: 'medium',
          data: {
            current_coverage: validationResult.testCoverage,
            target_coverage: 80
          }
        });
      }
    }
    
    return actions;
  }

  /**
   * Determine error severity
   * @param {Error} error - Error object
   * @returns {string} Severity level
   */
  determineSeverity(error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return 'critical';
    }
    
    if (error.message.includes('timeout') || error.message.includes('abort')) {
      return 'high';
    }
    
    if (error.message.includes('validation') || error.message.includes('parse')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Get protocol information
   * @returns {Object} Protocol information
   */
  getProtocolInfo() {
    return {
      name: 'AgentAPI Protocol',
      version: this.version,
      supported_message_types: Array.from(this.messageTypes),
      features: [
        'code_generation',
        'validation_updates',
        'session_management',
        'error_reporting',
        'health_checks'
      ]
    };
  }
}

export default AgentProtocol;

