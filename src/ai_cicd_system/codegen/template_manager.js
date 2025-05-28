/**
 * @fileoverview Template Manager for Codegen Prompt Instructions
 * @description Manages prompt instruction templates for consistent code generation
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from '../utils/logger.js';

/**
 * Template Manager for handling prompt instruction templates
 */
export class TemplateManager {
  constructor(config = {}) {
    this.templatesDir = config.templatesDir || path.join(process.cwd(), 'templates', 'prompt_instructions');
    this.cache = new Map();
    this.cacheEnabled = config.cacheEnabled !== false;
    this.maxCacheSize = config.maxCacheSize || 100;
    this.templateExtensions = config.templateExtensions || ['.md', '.txt', '.json'];
    
    log('debug', 'Template Manager initialized', {
      templatesDir: this.templatesDir,
      cacheEnabled: this.cacheEnabled,
      maxCacheSize: this.maxCacheSize
    });
  }

  /**
   * Initialize the template manager
   */
  async initialize() {
    try {
      await this._ensureTemplatesDirectory();
      await this._loadDefaultTemplates();
      log('info', 'Template Manager initialized successfully');
    } catch (error) {
      log('error', `Failed to initialize Template Manager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a template by name with variable substitution
   * @param {string} templateName - Name of the template
   * @param {Object} variables - Variables to substitute in the template
   * @returns {Promise<string>} Processed template content
   */
  async getTemplate(templateName, variables = {}) {
    try {
      const cacheKey = `${templateName}:${JSON.stringify(variables)}`;
      
      if (this.cacheEnabled && this.cache.has(cacheKey)) {
        log('debug', `Template cache hit for: ${templateName}`);
        return this.cache.get(cacheKey);
      }

      const templateContent = await this._loadTemplate(templateName);
      const processedContent = this._processTemplate(templateContent, variables);
      
      if (this.cacheEnabled) {
        this._addToCache(cacheKey, processedContent);
      }

      log('debug', `Template processed: ${templateName}`, {
        variableCount: Object.keys(variables).length,
        contentLength: processedContent.length
      });

      return processedContent;
    } catch (error) {
      log('error', `Failed to get template ${templateName}: ${error.message}`);
      throw new TemplateError('TEMPLATE_LOAD_FAILED', `Failed to load template: ${templateName}`, error);
    }
  }

  /**
   * Create a new template
   * @param {string} templateName - Name of the template
   * @param {string} content - Template content
   * @param {Object} metadata - Template metadata
   */
  async createTemplate(templateName, content, metadata = {}) {
    try {
      const templatePath = this._getTemplatePath(templateName);
      const templateData = {
        name: templateName,
        content,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          version: metadata.version || '1.0.0'
        }
      };

      await fs.writeFile(templatePath, JSON.stringify(templateData, null, 2));
      
      // Clear cache for this template
      this._clearTemplateFromCache(templateName);
      
      log('info', `Template created: ${templateName}`, { path: templatePath });
    } catch (error) {
      log('error', `Failed to create template ${templateName}: ${error.message}`);
      throw new TemplateError('TEMPLATE_CREATE_FAILED', `Failed to create template: ${templateName}`, error);
    }
  }

  /**
   * Update an existing template
   * @param {string} templateName - Name of the template
   * @param {string} content - New template content
   * @param {Object} metadata - Updated metadata
   */
  async updateTemplate(templateName, content, metadata = {}) {
    try {
      const templatePath = this._getTemplatePath(templateName);
      const existingTemplate = await this._loadTemplateFile(templatePath);
      
      const updatedTemplate = {
        ...existingTemplate,
        content,
        metadata: {
          ...existingTemplate.metadata,
          ...metadata,
          updatedAt: new Date().toISOString(),
          version: this._incrementVersion(existingTemplate.metadata.version || '1.0.0')
        }
      };

      await fs.writeFile(templatePath, JSON.stringify(updatedTemplate, null, 2));
      
      // Clear cache for this template
      this._clearTemplateFromCache(templateName);
      
      log('info', `Template updated: ${templateName}`, { 
        path: templatePath,
        version: updatedTemplate.metadata.version
      });
    } catch (error) {
      log('error', `Failed to update template ${templateName}: ${error.message}`);
      throw new TemplateError('TEMPLATE_UPDATE_FAILED', `Failed to update template: ${templateName}`, error);
    }
  }

  /**
   * Delete a template
   * @param {string} templateName - Name of the template to delete
   */
  async deleteTemplate(templateName) {
    try {
      const templatePath = this._getTemplatePath(templateName);
      await fs.unlink(templatePath);
      
      // Clear cache for this template
      this._clearTemplateFromCache(templateName);
      
      log('info', `Template deleted: ${templateName}`);
    } catch (error) {
      log('error', `Failed to delete template ${templateName}: ${error.message}`);
      throw new TemplateError('TEMPLATE_DELETE_FAILED', `Failed to delete template: ${templateName}`, error);
    }
  }

  /**
   * List all available templates
   * @returns {Promise<Array>} List of template metadata
   */
  async listTemplates() {
    try {
      const files = await fs.readdir(this.templatesDir);
      const templates = [];

      for (const file of files) {
        if (this._isTemplateFile(file)) {
          try {
            const templatePath = path.join(this.templatesDir, file);
            const templateData = await this._loadTemplateFile(templatePath);
            templates.push({
              name: templateData.name || path.parse(file).name,
              metadata: templateData.metadata || {},
              path: templatePath
            });
          } catch (error) {
            log('warning', `Failed to load template metadata for ${file}: ${error.message}`);
          }
        }
      }

      return templates;
    } catch (error) {
      log('error', `Failed to list templates: ${error.message}`);
      throw new TemplateError('TEMPLATE_LIST_FAILED', 'Failed to list templates', error);
    }
  }

  /**
   * Validate template syntax and variables
   * @param {string} templateContent - Template content to validate
   * @returns {Object} Validation result
   */
  validateTemplate(templateContent) {
    try {
      const variables = this._extractVariables(templateContent);
      const issues = [];

      // Check for unclosed variable brackets
      const openBrackets = (templateContent.match(/\{\{/g) || []).length;
      const closeBrackets = (templateContent.match(/\}\}/g) || []).length;
      
      if (openBrackets !== closeBrackets) {
        issues.push('Mismatched variable brackets');
      }

      // Check for invalid variable names
      variables.forEach(variable => {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable)) {
          issues.push(`Invalid variable name: ${variable}`);
        }
      });

      return {
        valid: issues.length === 0,
        issues,
        variables,
        variableCount: variables.length
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Validation error: ${error.message}`],
        variables: [],
        variableCount: 0
      };
    }
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.cache.clear();
    log('debug', 'Template cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      enabled: this.cacheEnabled,
      hitRate: this._calculateHitRate()
    };
  }

  // Private methods

  /**
   * Ensure templates directory exists
   */
  async _ensureTemplatesDirectory() {
    try {
      await fs.access(this.templatesDir);
    } catch (error) {
      await fs.mkdir(this.templatesDir, { recursive: true });
      log('info', `Created templates directory: ${this.templatesDir}`);
    }
  }

  /**
   * Load default templates if they don't exist
   */
  async _loadDefaultTemplates() {
    const defaultTemplates = this._getDefaultTemplates();
    
    for (const [name, template] of Object.entries(defaultTemplates)) {
      const templatePath = this._getTemplatePath(name);
      
      try {
        await fs.access(templatePath);
      } catch (error) {
        // Template doesn't exist, create it
        await this.createTemplate(name, template.content, template.metadata);
      }
    }
  }

  /**
   * Load template content from file
   * @param {string} templateName - Name of the template
   * @returns {Promise<string>} Template content
   */
  async _loadTemplate(templateName) {
    const templatePath = this._getTemplatePath(templateName);
    const templateData = await this._loadTemplateFile(templatePath);
    return templateData.content || templateData;
  }

  /**
   * Load template file and parse if JSON
   * @param {string} templatePath - Path to template file
   * @returns {Promise<Object|string>} Template data
   */
  async _loadTemplateFile(templatePath) {
    const content = await fs.readFile(templatePath, 'utf-8');
    
    if (templatePath.endsWith('.json')) {
      return JSON.parse(content);
    }
    
    return content;
  }

  /**
   * Process template with variable substitution
   * @param {string} template - Template content
   * @param {Object} variables - Variables to substitute
   * @returns {string} Processed template
   */
  _processTemplate(template, variables) {
    let processed = template;
    
    // Replace variables in {{variable}} format
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      processed = processed.replace(regex, String(value));
    }

    // Check for unresolved variables
    const unresolvedVariables = this._extractVariables(processed);
    if (unresolvedVariables.length > 0) {
      log('warning', `Unresolved variables in template: ${unresolvedVariables.join(', ')}`);
    }

    return processed;
  }

  /**
   * Extract variables from template content
   * @param {string} template - Template content
   * @returns {Array<string>} List of variable names
   */
  _extractVariables(template) {
    const matches = template.match(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g) || [];
    return matches.map(match => match.replace(/\{\{\s*|\s*\}\}/g, ''));
  }

  /**
   * Get template file path
   * @param {string} templateName - Name of the template
   * @returns {string} Full path to template file
   */
  _getTemplatePath(templateName) {
    // Add .json extension if no extension provided
    const fileName = templateName.includes('.') ? templateName : `${templateName}.json`;
    return path.join(this.templatesDir, fileName);
  }

  /**
   * Check if file is a template file
   * @param {string} fileName - File name to check
   * @returns {boolean} True if it's a template file
   */
  _isTemplateFile(fileName) {
    return this.templateExtensions.some(ext => fileName.endsWith(ext));
  }

  /**
   * Add content to cache with size management
   * @param {string} key - Cache key
   * @param {string} content - Content to cache
   */
  _addToCache(key, content) {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, content);
  }

  /**
   * Clear specific template from cache
   * @param {string} templateName - Name of template to clear
   */
  _clearTemplateFromCache(templateName) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${templateName}:`)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Increment version number
   * @param {string} version - Current version
   * @returns {string} Incremented version
   */
  _incrementVersion(version) {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0] || '1'}.${parts[1] || '0'}.${patch}`;
  }

  /**
   * Calculate cache hit rate
   * @returns {number} Hit rate percentage
   */
  _calculateHitRate() {
    // This would need to be implemented with proper hit/miss tracking
    return 0;
  }

  /**
   * Get default templates
   * @returns {Object} Default templates
   */
  _getDefaultTemplates() {
    return {
      'code_generation': {
        content: `# Code Generation Template

## Task Description
{{task_description}}

## Requirements
{{requirements}}

## Context
- Repository: {{repository_name}}
- Branch: {{branch_name}}
- Files to modify: {{affected_files}}

## Instructions
1. Analyze the requirements carefully
2. Generate clean, production-ready code
3. Follow existing code patterns and conventions
4. Include appropriate error handling
5. Add comprehensive tests
6. Update documentation as needed

## Quality Standards
- Code must be well-documented
- Follow language-specific best practices
- Ensure backward compatibility
- Include proper error handling
- Write comprehensive tests

## Output Format
Please provide:
1. Implementation code
2. Test files
3. Documentation updates
4. Migration scripts (if needed)`,
        metadata: {
          description: 'Standard template for code generation tasks',
          category: 'development',
          tags: ['code', 'generation', 'development']
        }
      },
      'bug_fix': {
        content: `# Bug Fix Template

## Bug Description
{{bug_description}}

## Steps to Reproduce
{{reproduction_steps}}

## Expected Behavior
{{expected_behavior}}

## Current Behavior
{{current_behavior}}

## Context
- Repository: {{repository_name}}
- Branch: {{branch_name}}
- Affected files: {{affected_files}}
- Error logs: {{error_logs}}

## Fix Instructions
1. Identify the root cause of the issue
2. Implement a minimal, targeted fix
3. Ensure the fix doesn't break existing functionality
4. Add regression tests
5. Update documentation if necessary

## Testing Requirements
- Add unit tests for the fix
- Verify existing tests still pass
- Test edge cases
- Validate the fix resolves the original issue`,
        metadata: {
          description: 'Template for bug fix tasks',
          category: 'maintenance',
          tags: ['bug', 'fix', 'maintenance']
        }
      },
      'feature_implementation': {
        content: `# Feature Implementation Template

## Feature Description
{{feature_description}}

## Acceptance Criteria
{{acceptance_criteria}}

## Technical Requirements
{{technical_requirements}}

## Context
- Repository: {{repository_name}}
- Branch: {{branch_name}}
- Dependencies: {{dependencies}}

## Implementation Guidelines
1. Break down the feature into smaller components
2. Implement core functionality first
3. Add comprehensive error handling
4. Ensure scalability and performance
5. Follow security best practices
6. Write thorough tests
7. Update documentation

## Deliverables
- Feature implementation
- Unit and integration tests
- API documentation (if applicable)
- User documentation
- Migration scripts (if needed)`,
        metadata: {
          description: 'Template for new feature implementation',
          category: 'development',
          tags: ['feature', 'implementation', 'development']
        }
      }
    };
  }
}

/**
 * Template Error class
 */
export class TemplateError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.name = 'TemplateError';
    this.code = code;
    this.originalError = originalError;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TemplateError);
    }
  }
}

export default TemplateManager;

