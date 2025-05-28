/**
 * @fileoverview Request Transformer
 * @description Transforms requests and responses between different system protocols
 */

import { log } from '../utils/simple_logger.js';

/**
 * Request Transformer - Handles protocol transformations
 */
export class RequestTransformer {
  constructor(config) {
    this.config = config;
    this.transformationRules = new Map();
    this.setupDefaultTransformations();
  }

  /**
   * Setup default transformation rules
   */
  setupDefaultTransformations() {
    // Task to AgentAPI request transformation
    this.transformationRules.set('task_to_agent', {
      transform: (task, context) => ({
        type: 'code_generation_request',
        id: context.requestId,
        session_id: context.session.id,
        payload: {
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            requirements: task.requirements || [],
            acceptance_criteria: task.acceptanceCriteria || [],
            complexity: task.complexityScore || 5,
            priority: task.priority || 'medium',
            files_affected: task.affectedFiles || []
          },
          context: {
            repository: context.repository,
            branch: context.branch,
            project_context: context.projectContext || {},
            user_preferences: context.userPreferences || {}
          },
          options: {
            generate_tests: true,
            include_documentation: true,
            follow_conventions: true,
            optimize_performance: true
          }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'claude-task-master',
          version: '1.0.0'
        }
      })
    });

    // AgentAPI response to Claude Code request transformation
    this.transformationRules.set('agent_to_claude_code', {
      transform: (agentResponse, context) => ({
        type: 'validation_request',
        id: `validation_${Date.now()}`,
        source_request_id: agentResponse.request_id,
        payload: {
          code_changes: agentResponse.payload.code_changes || [],
          files_created: agentResponse.payload.files_created || [],
          files_modified: agentResponse.payload.files_modified || [],
          test_files: agentResponse.payload.test_files || [],
          documentation: agentResponse.payload.documentation || []
        },
        validation_config: {
          check_syntax: true,
          check_logic: true,
          check_performance: true,
          check_security: true,
          run_tests: true,
          generate_report: true
        },
        context: {
          task: context.task,
          session: context.session,
          original_request: agentResponse.original_request
        }
      })
    });

    // Claude Code response to AgentAPI update transformation
    this.transformationRules.set('claude_code_to_agent', {
      transform: (claudeResponse, context) => ({
        type: 'validation_update',
        id: `update_${Date.now()}`,
        validation_id: claudeResponse.validationId,
        session_id: context.sessionId,
        payload: {
          validation_status: claudeResponse.success ? 'passed' : 'failed',
          issues_found: claudeResponse.issues || [],
          suggestions: claudeResponse.suggestions || [],
          metrics: claudeResponse.metrics || {},
          fixes_applied: claudeResponse.fixes || [],
          test_results: claudeResponse.testResults || {}
        },
        next_actions: this.determineNextActions(claudeResponse),
        metadata: {
          timestamp: new Date().toISOString(),
          validation_duration: claudeResponse.duration || 0,
          environment: claudeResponse.environment || 'unknown'
        }
      })
    });
  }

  /**
   * Transform task to AgentAPI request
   * @param {Object} task - Task to transform
   * @param {Object} context - Transformation context
   * @returns {Promise<Object>} Transformed AgentAPI request
   */
  async transformTaskToAgentRequest(task, context) {
    const rule = this.transformationRules.get('task_to_agent');
    if (!rule) {
      throw new Error('Task to AgentAPI transformation rule not found');
    }
    
    log('debug', `🔄 Transforming task ${task.id} to AgentAPI request`);
    
    const transformed = rule.transform(task, context);
    
    // Apply any custom transformations
    const result = await this.applyCustomTransformations(transformed, 'task_to_agent', context);
    
    log('debug', `✅ Task transformation completed for ${task.id}`);
    return result;
  }

  /**
   * Transform AgentAPI response to Claude Code request
   * @param {Object} agentResponse - AgentAPI response
   * @param {Object} context - Transformation context
   * @returns {Promise<Object>} Transformed Claude Code request
   */
  async transformAgentResponseToClaudeCode(agentResponse, context) {
    const rule = this.transformationRules.get('agent_to_claude_code');
    if (!rule) {
      throw new Error('AgentAPI to Claude Code transformation rule not found');
    }
    
    log('debug', `🔄 Transforming AgentAPI response to Claude Code request`);
    
    const transformed = rule.transform(agentResponse, context);
    
    const result = await this.applyCustomTransformations(transformed, 'agent_to_claude_code', context);
    
    log('debug', `✅ AgentAPI response transformation completed`);
    return result;
  }

  /**
   * Transform Claude Code response to AgentAPI update
   * @param {Object} claudeResponse - Claude Code response
   * @param {Object} context - Transformation context
   * @returns {Promise<Object>} Transformed AgentAPI update
   */
  async transformClaudeCodeResponseToAgent(claudeResponse, context) {
    const rule = this.transformationRules.get('claude_code_to_agent');
    if (!rule) {
      throw new Error('Claude Code to AgentAPI transformation rule not found');
    }
    
    log('debug', `🔄 Transforming Claude Code response to AgentAPI update`);
    
    const transformed = rule.transform(claudeResponse, context);
    
    const result = await this.applyCustomTransformations(transformed, 'claude_code_to_agent', context);
    
    log('debug', `✅ Claude Code response transformation completed`);
    return result;
  }

  /**
   * Determine next actions based on Claude Code response
   * @param {Object} claudeResponse - Claude Code response
   * @returns {Array} Array of next actions
   */
  determineNextActions(claudeResponse) {
    const actions = [];
    
    if (!claudeResponse.success) {
      if (claudeResponse.issues && claudeResponse.issues.length > 0) {
        actions.push({
          type: 'fix_issues',
          priority: 'high',
          issues: claudeResponse.issues
        });
      }
      
      if (claudeResponse.suggestions && claudeResponse.suggestions.length > 0) {
        actions.push({
          type: 'apply_suggestions',
          priority: 'medium',
          suggestions: claudeResponse.suggestions
        });
      }
    } else {
      actions.push({
        type: 'create_pr',
        priority: 'high',
        data: {
          title: claudeResponse.prTitle || 'Automated code generation',
          description: claudeResponse.prDescription || 'Generated by AI CI/CD system',
          files: claudeResponse.modifiedFiles || []
        }
      });
    }
    
    return actions;
  }

  /**
   * Apply custom transformations
   * @param {Object} data - Data to transform
   * @param {string} transformationType - Type of transformation
   * @param {Object} context - Transformation context
   * @returns {Promise<Object>} Transformed data
   */
  async applyCustomTransformations(data, transformationType, context) {
    // Apply any custom transformation logic here
    // This could include user-specific preferences, project-specific rules, etc.
    
    // Example: Apply user preferences
    if (context.userPreferences) {
      data = this._applyUserPreferences(data, context.userPreferences);
    }
    
    // Example: Apply project-specific rules
    if (context.projectContext) {
      data = this._applyProjectRules(data, context.projectContext);
    }
    
    return data;
  }

  /**
   * Add custom transformation rule
   * @param {string} ruleId - Rule identifier
   * @param {Object} rule - Transformation rule
   */
  addTransformationRule(ruleId, rule) {
    if (!rule.transform || typeof rule.transform !== 'function') {
      throw new Error('Transformation rule must have a transform function');
    }
    
    this.transformationRules.set(ruleId, rule);
    log('debug', `📝 Added custom transformation rule: ${ruleId}`);
  }

  /**
   * Remove transformation rule
   * @param {string} ruleId - Rule identifier
   */
  removeTransformationRule(ruleId) {
    const removed = this.transformationRules.delete(ruleId);
    if (removed) {
      log('debug', `🗑️ Removed transformation rule: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Get transformation rule
   * @param {string} ruleId - Rule identifier
   * @returns {Object|null} Transformation rule
   */
  getTransformationRule(ruleId) {
    return this.transformationRules.get(ruleId) || null;
  }

  /**
   * List all transformation rules
   * @returns {Array} Array of rule IDs
   */
  listTransformationRules() {
    return Array.from(this.transformationRules.keys());
  }

  /**
   * Apply user preferences to data
   * @param {Object} data - Data to modify
   * @param {Object} userPreferences - User preferences
   * @returns {Object} Modified data
   * @private
   */
  _applyUserPreferences(data, userPreferences) {
    // Example implementation
    if (userPreferences.codeStyle) {
      data.options = {
        ...data.options,
        code_style: userPreferences.codeStyle
      };
    }
    
    if (userPreferences.testingFramework) {
      data.options = {
        ...data.options,
        testing_framework: userPreferences.testingFramework
      };
    }
    
    return data;
  }

  /**
   * Apply project-specific rules to data
   * @param {Object} data - Data to modify
   * @param {Object} projectContext - Project context
   * @returns {Object} Modified data
   * @private
   */
  _applyProjectRules(data, projectContext) {
    // Example implementation
    if (projectContext.language) {
      data.context = {
        ...data.context,
        primary_language: projectContext.language
      };
    }
    
    if (projectContext.framework) {
      data.context = {
        ...data.context,
        framework: projectContext.framework
      };
    }
    
    return data;
  }

  /**
   * Get transformer statistics
   * @returns {Object} Transformer statistics
   */
  getStatistics() {
    return {
      total_rules: this.transformationRules.size,
      available_transformations: this.listTransformationRules()
    };
  }

  /**
   * Get transformer health
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: 'healthy',
      rules_loaded: this.transformationRules.size,
      default_rules_available: this.transformationRules.has('task_to_agent') &&
                               this.transformationRules.has('agent_to_claude_code') &&
                               this.transformationRules.has('claude_code_to_agent')
    };
  }
}

export default RequestTransformer;

