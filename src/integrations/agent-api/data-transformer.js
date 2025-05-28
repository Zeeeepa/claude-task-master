/**
 * Data Transformer
 * 
 * Handles data transformation between different component formats.
 * Ensures data integrity and format compatibility between System Orchestrator and Claude Code.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { SimpleLogger } from '../../ai_cicd_system/utils/simple_logger.js';

export class DataTransformer {
  constructor(config = {}) {
    this.config = {
      validateInput: config.validateInput !== false,
      validateOutput: config.validateOutput !== false,
      strictMode: config.strictMode !== false,
      ...config
    };

    this.logger = new SimpleLogger('DataTransformer');
    
    // Initialize JSON schema validator
    this.ajv = new Ajv({ 
      allErrors: true, 
      strict: this.config.strictMode,
      removeAdditional: true
    });
    addFormats(this.ajv);

    this._setupSchemas();
  }

  /**
   * Setup validation schemas
   */
  _setupSchemas() {
    // Orchestrator workflow command schema
    this.orchestratorWorkflowSchema = {
      type: 'object',
      properties: {
        workflowId: { type: 'string', minLength: 1 },
        command: { 
          type: 'string', 
          enum: ['start', 'stop', 'pause', 'resume', 'analyze', 'validate', 'deploy'] 
        },
        payload: {
          type: 'object',
          properties: {
            codebase: {
              type: 'object',
              properties: {
                repository: { type: 'string', format: 'uri' },
                branch: { type: 'string' },
                commit: { type: 'string' },
                path: { type: 'string' }
              },
              required: ['repository']
            },
            parameters: { type: 'object' },
            metadata: { type: 'object' }
          }
        },
        priority: { type: 'integer', minimum: 1, maximum: 10 },
        timeout: { type: 'integer', minimum: 1000 },
        retryPolicy: {
          type: 'object',
          properties: {
            maxRetries: { type: 'integer', minimum: 0 },
            backoffMultiplier: { type: 'number', minimum: 1 },
            initialDelay: { type: 'integer', minimum: 100 }
          }
        }
      },
      required: ['workflowId', 'command'],
      additionalProperties: false
    };

    // Claude Code request schema
    this.claudeCodeRequestSchema = {
      type: 'object',
      properties: {
        action: { 
          type: 'string',
          enum: ['analyze', 'validate', 'refactor', 'test', 'document', 'review']
        },
        codebase: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['git', 'local', 'archive'] },
            source: { type: 'string' },
            ref: { type: 'string' },
            path: { type: 'string' }
          },
          required: ['type', 'source']
        },
        options: {
          type: 'object',
          properties: {
            language: { type: 'string' },
            framework: { type: 'string' },
            analysisDepth: { type: 'string', enum: ['shallow', 'medium', 'deep'] },
            includeTests: { type: 'boolean' },
            includeDocs: { type: 'boolean' },
            outputFormat: { type: 'string', enum: ['json', 'markdown', 'html'] }
          }
        },
        context: {
          type: 'object',
          properties: {
            requestId: { type: 'string' },
            userId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            metadata: { type: 'object' }
          }
        }
      },
      required: ['action', 'codebase'],
      additionalProperties: false
    };

    // Claude Code response schema
    this.claudeCodeResponseSchema = {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        action: { type: 'string' },
        result: {
          type: 'object',
          properties: {
            analysis: { type: 'object' },
            suggestions: { type: 'array', items: { type: 'object' } },
            metrics: { type: 'object' },
            files: { type: 'array', items: { type: 'object' } },
            errors: { type: 'array', items: { type: 'object' } },
            warnings: { type: 'array', items: { type: 'object' } }
          }
        },
        metadata: {
          type: 'object',
          properties: {
            processingTime: { type: 'number' },
            tokensUsed: { type: 'integer' },
            model: { type: 'string' },
            version: { type: 'string' }
          }
        },
        timestamp: { type: 'string', format: 'date-time' }
      },
      required: ['success', 'action', 'result', 'timestamp'],
      additionalProperties: false
    };

    // Compile schemas
    this.validateOrchestratorWorkflow = this.ajv.compile(this.orchestratorWorkflowSchema);
    this.validateClaudeCodeRequest = this.ajv.compile(this.claudeCodeRequestSchema);
    this.validateClaudeCodeResponse = this.ajv.compile(this.claudeCodeResponseSchema);
  }

  /**
   * Transform data for Claude Code integration
   */
  async transformForClaudeCode(data) {
    try {
      this.logger.debug('Transforming data for Claude Code', { inputType: typeof data });

      // Handle different input types
      let transformedData;

      if (this._isWorkflowCommand(data)) {
        transformedData = await this._transformWorkflowToClaudeCode(data);
      } else if (this._isAnalysisRequest(data)) {
        transformedData = await this._transformAnalysisToClaudeCode(data);
      } else {
        transformedData = await this._transformGenericToClaudeCode(data);
      }

      // Validate output if enabled
      if (this.config.validateOutput) {
        const validation = this.validateClaudeCodeRequest(transformedData);
        if (!validation) {
          throw new Error(`Invalid Claude Code request format: ${this.ajv.errorsText()}`);
        }
      }

      this.logger.debug('Data transformed for Claude Code successfully');
      return transformedData;

    } catch (error) {
      this.logger.error('Error transforming data for Claude Code:', error);
      throw error;
    }
  }

  /**
   * Transform data from Claude Code format
   */
  async transformFromClaudeCode(data) {
    try {
      this.logger.debug('Transforming data from Claude Code', { inputType: typeof data });

      // Validate input if enabled
      if (this.config.validateInput) {
        const validation = this.validateClaudeCodeResponse(data);
        if (!validation) {
          throw new Error(`Invalid Claude Code response format: ${this.ajv.errorsText()}`);
        }
      }

      const transformedData = await this._transformClaudeCodeToOrchestrator(data);

      this.logger.debug('Data transformed from Claude Code successfully');
      return transformedData;

    } catch (error) {
      this.logger.error('Error transforming data from Claude Code:', error);
      throw error;
    }
  }

  /**
   * Check if data is a workflow command
   */
  _isWorkflowCommand(data) {
    return data && typeof data === 'object' && 
           data.workflowId && data.command;
  }

  /**
   * Check if data is an analysis request
   */
  _isAnalysisRequest(data) {
    return data && typeof data === 'object' && 
           (data.analysisType || data.codebase);
  }

  /**
   * Transform workflow command to Claude Code format
   */
  async _transformWorkflowToClaudeCode(workflow) {
    const actionMap = {
      'start': 'analyze',
      'analyze': 'analyze',
      'validate': 'validate',
      'stop': 'analyze', // Default fallback
      'pause': 'analyze',
      'resume': 'analyze',
      'deploy': 'validate'
    };

    return {
      action: actionMap[workflow.command] || 'analyze',
      codebase: {
        type: 'git',
        source: workflow.payload?.codebase?.repository || '',
        ref: workflow.payload?.codebase?.branch || 'main',
        path: workflow.payload?.codebase?.path || '.'
      },
      options: {
        analysisDepth: this._mapPriorityToDepth(workflow.priority),
        includeTests: true,
        includeDocs: true,
        outputFormat: 'json',
        ...workflow.payload?.parameters
      },
      context: {
        requestId: workflow.workflowId,
        timestamp: new Date().toISOString(),
        metadata: {
          originalCommand: workflow.command,
          priority: workflow.priority,
          timeout: workflow.timeout,
          retryPolicy: workflow.retryPolicy,
          ...workflow.payload?.metadata
        }
      }
    };
  }

  /**
   * Transform analysis request to Claude Code format
   */
  async _transformAnalysisToClaudeCode(analysis) {
    return {
      action: analysis.analysisType || 'analyze',
      codebase: {
        type: analysis.codebase?.type || 'git',
        source: analysis.codebase?.repository || analysis.codebase?.source || '',
        ref: analysis.codebase?.branch || analysis.codebase?.ref || 'main',
        path: analysis.codebase?.path || '.'
      },
      options: {
        language: analysis.options?.language,
        framework: analysis.options?.framework,
        analysisDepth: analysis.options?.depth || 'medium',
        includeTests: analysis.options?.includeTests !== false,
        includeDocs: analysis.options?.includeDocs !== false,
        outputFormat: analysis.options?.format || 'json'
      },
      context: {
        requestId: analysis.requestId || this._generateRequestId(),
        timestamp: new Date().toISOString(),
        metadata: analysis.metadata || {}
      }
    };
  }

  /**
   * Transform generic data to Claude Code format
   */
  async _transformGenericToClaudeCode(data) {
    return {
      action: 'analyze',
      codebase: {
        type: 'local',
        source: data.source || '.',
        path: data.path || '.'
      },
      options: {
        analysisDepth: 'medium',
        includeTests: true,
        includeDocs: true,
        outputFormat: 'json'
      },
      context: {
        requestId: this._generateRequestId(),
        timestamp: new Date().toISOString(),
        metadata: data
      }
    };
  }

  /**
   * Transform Claude Code response to orchestrator format
   */
  async _transformClaudeCodeToOrchestrator(response) {
    return {
      success: response.success,
      action: response.action,
      workflowId: response.metadata?.requestId,
      result: {
        status: response.success ? 'completed' : 'failed',
        data: response.result,
        analysis: response.result?.analysis,
        suggestions: response.result?.suggestions || [],
        metrics: response.result?.metrics || {},
        files: response.result?.files || [],
        errors: response.result?.errors || [],
        warnings: response.result?.warnings || []
      },
      performance: {
        processingTime: response.metadata?.processingTime,
        tokensUsed: response.metadata?.tokensUsed,
        model: response.metadata?.model
      },
      timestamp: response.timestamp,
      metadata: {
        originalAction: response.action,
        version: response.metadata?.version,
        transformedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Map priority to analysis depth
   */
  _mapPriorityToDepth(priority) {
    if (!priority) return 'medium';
    
    if (priority <= 3) return 'shallow';
    if (priority <= 7) return 'medium';
    return 'deep';
  }

  /**
   * Generate unique request ID
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Validate data against schema
   */
  async validateData(data, schemaName = null) {
    try {
      let validator;
      
      if (schemaName) {
        const schemaMap = {
          'orchestrator-workflow': this.validateOrchestratorWorkflow,
          'claude-code-request': this.validateClaudeCodeRequest,
          'claude-code-response': this.validateClaudeCodeResponse
        };
        
        validator = schemaMap[schemaName];
        if (!validator) {
          throw new Error(`Unknown schema: ${schemaName}`);
        }
      } else {
        // Auto-detect schema based on data structure
        if (this._isWorkflowCommand(data)) {
          validator = this.validateOrchestratorWorkflow;
        } else if (data.action && data.codebase) {
          validator = this.validateClaudeCodeRequest;
        } else if (data.success !== undefined && data.result) {
          validator = this.validateClaudeCodeResponse;
        } else {
          return { valid: true, errors: [] }; // No specific schema to validate against
        }
      }

      const valid = validator(data);
      
      return {
        valid,
        errors: valid ? [] : validator.errors.map(error => ({
          path: error.instancePath,
          message: error.message,
          value: error.data
        }))
      };

    } catch (error) {
      this.logger.error('Validation error:', error);
      return {
        valid: false,
        errors: [{ message: error.message }]
      };
    }
  }

  /**
   * Sanitize data by removing sensitive information
   */
  sanitizeData(data) {
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'key'];
    
    const sanitize = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }
      
      if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            sanitized[key] = '[REDACTED]';
          } else {
            sanitized[key] = sanitize(value);
          }
        }
        return sanitized;
      }
      
      return obj;
    };

    return sanitize(data);
  }

  /**
   * Deep clone data
   */
  cloneData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  /**
   * Merge data objects
   */
  mergeData(target, source) {
    const merged = this.cloneData(target);
    
    const merge = (obj1, obj2) => {
      for (const key in obj2) {
        if (obj2[key] && typeof obj2[key] === 'object' && !Array.isArray(obj2[key])) {
          obj1[key] = obj1[key] || {};
          merge(obj1[key], obj2[key]);
        } else {
          obj1[key] = obj2[key];
        }
      }
    };

    merge(merged, source);
    return merged;
  }

  /**
   * Get transformation statistics
   */
  getStats() {
    return {
      schemasLoaded: Object.keys(this.ajv.schemas).length,
      validationEnabled: {
        input: this.config.validateInput,
        output: this.config.validateOutput
      },
      strictMode: this.config.strictMode
    };
  }
}

export default DataTransformer;

