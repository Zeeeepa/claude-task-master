/**
 * ValidationManager.js
 * Centralized validation using Zod schemas
 * Provides consistent validation across all data operations
 */

import { z } from 'zod';
import { log } from '../../utils.js';

/**
 * Centralized validation manager
 * Manages Zod schemas and provides validation services
 */
export class ValidationManager {
  constructor() {
    this.schemas = new Map();
    this.registerDefaultSchemas();
  }

  /**
   * Register a validation schema
   * @param {string} name - Schema name
   * @param {z.ZodSchema} schema - Zod schema
   */
  registerSchema(name, schema) {
    if (!(schema instanceof z.ZodSchema)) {
      throw new Error('Schema must be a Zod schema instance');
    }
    this.schemas.set(name, schema);
    log('debug', `[ValidationManager] Registered schema: ${name}`);
  }

  /**
   * Get a registered schema
   * @param {string} name - Schema name
   * @returns {z.ZodSchema|null} The schema or null if not found
   */
  getSchema(name) {
    return this.schemas.get(name) || null;
  }

  /**
   * Validate data against a schema
   * @param {any} data - Data to validate
   * @param {string|z.ZodSchema} schema - Schema name or schema instance
   * @returns {Object} Validation result
   */
  validate(data, schema) {
    try {
      let zodSchema;
      
      if (typeof schema === 'string') {
        zodSchema = this.getSchema(schema);
        if (!zodSchema) {
          return {
            success: false,
            error: `Schema not found: ${schema}`,
            data: null
          };
        }
      } else if (schema instanceof z.ZodSchema) {
        zodSchema = schema;
      } else {
        return {
          success: false,
          error: 'Invalid schema type. Must be string name or Zod schema instance',
          data: null
        };
      }

      const result = zodSchema.safeParse(data);
      
      if (result.success) {
        return {
          success: true,
          data: result.data,
          error: null
        };
      } else {
        return {
          success: false,
          error: this._formatZodError(result.error),
          data: null
        };
      }
    } catch (error) {
      log('error', '[ValidationManager] Validation error:', error);
      return {
        success: false,
        error: `Validation failed: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * Validate and transform data
   * @param {any} data - Data to validate and transform
   * @param {string|z.ZodSchema} schema - Schema name or schema instance
   * @returns {any} Transformed data
   * @throws {Error} If validation fails
   */
  validateAndTransform(data, schema) {
    const result = this.validate(data, schema);
    if (!result.success) {
      throw new Error(`Validation failed: ${result.error}`);
    }
    return result.data;
  }

  /**
   * Check if data is valid against schema (boolean result)
   * @param {any} data - Data to validate
   * @param {string|z.ZodSchema} schema - Schema name or schema instance
   * @returns {boolean} True if valid
   */
  isValid(data, schema) {
    const result = this.validate(data, schema);
    return result.success;
  }

  /**
   * Get list of registered schema names
   * @returns {string[]} Array of schema names
   */
  getSchemaNames() {
    return Array.from(this.schemas.keys());
  }

  /**
   * Remove a schema
   * @param {string} name - Schema name to remove
   * @returns {boolean} True if schema was removed
   */
  removeSchema(name) {
    const removed = this.schemas.delete(name);
    if (removed) {
      log('debug', `[ValidationManager] Removed schema: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all schemas
   */
  clearSchemas() {
    this.schemas.clear();
    log('debug', '[ValidationManager] Cleared all schemas');
  }

  /**
   * Register default schemas used throughout the application
   * @private
   */
  registerDefaultSchemas() {
    // Task schema
    this.registerSchema('task', z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).max(200),
      description: z.string().min(1),
      status: z.enum(['pending', 'in-progress', 'done', 'deferred']),
      dependencies: z.array(z.number().int().positive()).default([]),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      details: z.string().optional(),
      testStrategy: z.string().optional(),
      subtasks: z.array(z.any()).default([]),
      previousStatus: z.string().optional()
    }));

    // Tasks collection schema
    this.registerSchema('tasks', z.object({
      tasks: z.array(z.lazy(() => this.getSchema('task')))
    }));

    // Subtask schema
    this.registerSchema('subtask', z.object({
      id: z.string(),
      title: z.string().min(1).max(200),
      description: z.string().min(1),
      status: z.enum(['pending', 'in-progress', 'done', 'deferred']),
      details: z.string().optional(),
      testStrategy: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium')
    }));

    // Configuration schema
    this.registerSchema('config', z.object({
      models: z.object({
        main: z.object({
          provider: z.string(),
          modelId: z.string(),
          maxTokens: z.number().int().positive(),
          temperature: z.number().min(0).max(2)
        }),
        research: z.object({
          provider: z.string(),
          modelId: z.string(),
          maxTokens: z.number().int().positive(),
          temperature: z.number().min(0).max(2)
        }),
        fallback: z.object({
          provider: z.string().optional(),
          modelId: z.string().optional(),
          maxTokens: z.number().int().positive().optional(),
          temperature: z.number().min(0).max(2).optional()
        }).optional()
      }),
      global: z.object({
        logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        debug: z.boolean().default(false),
        defaultSubtasks: z.number().int().positive().default(5),
        defaultPriority: z.enum(['low', 'medium', 'high']).default('medium'),
        projectName: z.string().default('Task Master'),
        ollamaBaseUrl: z.string().url().default('http://localhost:11434/api'),
        userId: z.string().optional()
      })
    }));

    // Model configuration schema
    this.registerSchema('modelConfig', z.object({
      provider: z.string(),
      modelId: z.string(),
      maxTokens: z.number().int().positive(),
      temperature: z.number().min(0).max(2),
      baseUrl: z.string().url().optional()
    }));

    // Supported models schema
    this.registerSchema('supportedModels', z.record(
      z.string(),
      z.array(z.object({
        id: z.string(),
        swe_score: z.number().optional(),
        cost_per_1m_tokens: z.object({
          input: z.number().optional(),
          output: z.number().optional()
        }).optional(),
        allowed_roles: z.array(z.string()).default(['main', 'fallback'])
      }))
    ));

    // AI task data schema (for task creation)
    this.registerSchema('aiTaskData', z.object({
      title: z.string().min(1).max(200),
      description: z.string().min(1),
      details: z.string(),
      testStrategy: z.string(),
      dependencies: z.array(z.number().int().positive()).optional().default([])
    }));

    // Dependency schema
    this.registerSchema('dependency', z.object({
      from: z.number().int().positive(),
      to: z.number().int().positive(),
      type: z.enum(['blocks', 'requires', 'suggests']).default('blocks')
    }));

    // Generic JSON schema for basic validation
    this.registerSchema('json', z.any());

    log('debug', '[ValidationManager] Registered default schemas');
  }

  /**
   * Format Zod error for human-readable output
   * @param {z.ZodError} error - Zod error object
   * @returns {string} Formatted error message
   * @private
   */
  _formatZodError(error) {
    const issues = error.issues.map(issue => {
      const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
      return `${issue.message}${path}`;
    });
    
    return issues.join('; ');
  }

  /**
   * Create a partial schema from an existing schema
   * @param {string} schemaName - Name of existing schema
   * @returns {z.ZodSchema|null} Partial schema or null if not found
   */
  createPartialSchema(schemaName) {
    const schema = this.getSchema(schemaName);
    if (!schema) return null;
    
    if (schema instanceof z.ZodObject) {
      return schema.partial();
    }
    
    return schema;
  }

  /**
   * Create an array schema from an existing schema
   * @param {string} schemaName - Name of existing schema
   * @returns {z.ZodSchema|null} Array schema or null if not found
   */
  createArraySchema(schemaName) {
    const schema = this.getSchema(schemaName);
    if (!schema) return null;
    
    return z.array(schema);
  }

  /**
   * Merge multiple schemas into one
   * @param {string[]} schemaNames - Names of schemas to merge
   * @returns {z.ZodSchema|null} Merged schema or null if any schema not found
   */
  mergeSchemas(schemaNames) {
    const schemas = schemaNames.map(name => this.getSchema(name));
    
    if (schemas.some(schema => !schema)) {
      return null;
    }

    // Only works with ZodObject schemas
    const objectSchemas = schemas.filter(schema => schema instanceof z.ZodObject);
    if (objectSchemas.length !== schemas.length) {
      throw new Error('Can only merge ZodObject schemas');
    }

    return objectSchemas.reduce((merged, schema) => merged.merge(schema));
  }

  /**
   * Get validation statistics
   * @returns {Object} Validation statistics
   */
  getStats() {
    return {
      registeredSchemas: this.schemas.size,
      schemaNames: this.getSchemaNames()
    };
  }
}

export default ValidationManager;

