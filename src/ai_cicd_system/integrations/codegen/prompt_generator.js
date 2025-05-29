/**
 * @fileoverview Intelligent Prompt Creation for Codegen
 * @description Advanced prompt generation system for optimal Codegen API requests
 */

import { log } from '../../utils/simple_logger.js';

/**
 * Prompt Generator for Codegen API optimization
 */
export class PromptGenerator {
  constructor(config = {}) {
    this.config = {
      maxPromptLength: config.maxPromptLength || 4000,
      includeContext: config.includeContext !== false,
      includeExamples: config.includeExamples !== false,
      optimizeForCodegen: config.optimizeForCodegen !== false,
      templateVersion: config.templateVersion || '1.0'
    };
    
    // Prompt templates for different intents
    this.templates = {
      create: {
        prefix: 'Create',
        structure: ['context', 'requirements', 'specifications', 'examples', 'constraints'],
        emphasis: 'new functionality'
      },
      modify: {
        prefix: 'Modify',
        structure: ['context', 'current_state', 'desired_changes', 'constraints', 'examples'],
        emphasis: 'existing code'
      },
      fix: {
        prefix: 'Fix',
        structure: ['context', 'problem_description', 'expected_behavior', 'constraints'],
        emphasis: 'bug resolution'
      },
      refactor: {
        prefix: 'Refactor',
        structure: ['context', 'current_code', 'improvement_goals', 'constraints'],
        emphasis: 'code improvement'
      },
      delete: {
        prefix: 'Remove',
        structure: ['context', 'target_code', 'cleanup_requirements', 'constraints'],
        emphasis: 'safe removal'
      }
    };
    
    // Best practices for different technologies
    this.techBestPractices = {
      javascript: [
        'Use modern ES6+ syntax',
        'Follow ESLint standards',
        'Include proper error handling',
        'Use async/await for promises'
      ],
      typescript: [
        'Use proper type annotations',
        'Follow TypeScript best practices',
        'Include interface definitions',
        'Use generic types where appropriate'
      ],
      react: [
        'Use functional components with hooks',
        'Follow React best practices',
        'Include proper prop types',
        'Use proper state management'
      ],
      python: [
        'Follow PEP 8 style guide',
        'Include proper type hints',
        'Use docstrings for documentation',
        'Include proper error handling'
      ]
    };
    
    log('debug', 'PromptGenerator initialized', { config: this.config });
  }

  /**
   * Generate optimized prompt for Codegen API
   * @param {Object} analysis - Task analysis result
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Generated prompt
   */
  async generatePrompt(analysis, context = {}) {
    try {
      log('info', `Generating prompt for ${analysis.intent.primary} task`);
      
      const template = this.templates[analysis.intent.primary] || this.templates.create;
      
      const prompt = {
        content: await this._buildPromptContent(analysis, context, template),
        metadata: {
          intent: analysis.intent.primary,
          complexity: analysis.complexity.level,
          estimatedTokens: 0,
          template: template,
          generatedAt: new Date().toISOString()
        },
        config: {
          temperature: this._calculateTemperature(analysis),
          maxTokens: this._calculateMaxTokens(analysis),
          stopSequences: this._getStopSequences(analysis)
        }
      };
      
      // Estimate token count
      prompt.metadata.estimatedTokens = this._estimateTokens(prompt.content);
      
      // Validate and optimize prompt
      await this._validatePrompt(prompt);
      await this._optimizePrompt(prompt, analysis);
      
      log('info', `Prompt generated successfully`, {
        length: prompt.content.length,
        estimatedTokens: prompt.metadata.estimatedTokens,
        intent: analysis.intent.primary
      });
      
      return prompt;
      
    } catch (error) {
      log('error', `Prompt generation failed: ${error.message}`);
      throw new Error(`Prompt generation failed: ${error.message}`);
    }
  }

  /**
   * Generate prompt for specific code generation task
   * @param {Object} taskSpec - Task specification
   * @returns {Promise<Object>} Generated prompt
   */
  async generateCodePrompt(taskSpec) {
    const {
      type = 'function',
      name,
      description,
      parameters = [],
      returnType,
      language = 'javascript',
      framework,
      examples = []
    } = taskSpec;
    
    let prompt = `Generate a ${type} in ${language}`;
    
    if (framework) {
      prompt += ` using ${framework}`;
    }
    
    prompt += `:\n\n`;
    
    // Add specifications
    prompt += `Name: ${name}\n`;
    prompt += `Description: ${description}\n`;
    
    if (parameters.length > 0) {
      prompt += `Parameters:\n`;
      parameters.forEach(param => {
        prompt += `- ${param.name} (${param.type}): ${param.description}\n`;
      });
    }
    
    if (returnType) {
      prompt += `Return Type: ${returnType}\n`;
    }
    
    // Add best practices
    const practices = this.techBestPractices[language] || [];
    if (practices.length > 0) {
      prompt += `\nBest Practices:\n`;
      practices.forEach(practice => {
        prompt += `- ${practice}\n`;
      });
    }
    
    // Add examples
    if (examples.length > 0) {
      prompt += `\nExamples:\n`;
      examples.forEach((example, index) => {
        prompt += `Example ${index + 1}:\n${example}\n\n`;
      });
    }
    
    return {
      content: prompt,
      metadata: {
        type: 'code_generation',
        language,
        framework,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Generate prompt for PR description
   * @param {Object} changes - Code changes information
   * @param {Object} analysis - Task analysis
   * @returns {Promise<Object>} PR description prompt
   */
  async generatePRPrompt(changes, analysis) {
    const {
      files = [],
      additions = 0,
      deletions = 0,
      commits = []
    } = changes;
    
    let prompt = `Generate a comprehensive PR description for the following changes:\n\n`;
    
    // Add summary
    prompt += `## Summary\n`;
    prompt += `${analysis.originalDescription}\n\n`;
    
    // Add changes overview
    prompt += `## Changes Overview\n`;
    prompt += `- Files modified: ${files.length}\n`;
    prompt += `- Lines added: ${additions}\n`;
    prompt += `- Lines deleted: ${deletions}\n\n`;
    
    // Add file changes
    if (files.length > 0) {
      prompt += `## Files Changed\n`;
      files.forEach(file => {
        prompt += `- \`${file.name}\`: ${file.description || 'Modified'}\n`;
      });
      prompt += `\n`;
    }
    
    // Add technical details
    if (analysis.technologies.languages.length > 0) {
      prompt += `## Technologies\n`;
      prompt += `- Languages: ${analysis.technologies.languages.join(', ')}\n`;
      
      if (analysis.technologies.frameworks.length > 0) {
        prompt += `- Frameworks: ${analysis.technologies.frameworks.join(', ')}\n`;
      }
      prompt += `\n`;
    }
    
    // Add requirements
    if (analysis.requirements.functional.length > 0) {
      prompt += `## Requirements Addressed\n`;
      analysis.requirements.functional.forEach(req => {
        prompt += `- ${req}\n`;
      });
      prompt += `\n`;
    }
    
    // Add testing notes
    prompt += `## Testing\n`;
    prompt += `- [ ] Unit tests added/updated\n`;
    prompt += `- [ ] Integration tests verified\n`;
    prompt += `- [ ] Manual testing completed\n\n`;
    
    // Add checklist
    prompt += `## Checklist\n`;
    prompt += `- [ ] Code follows project standards\n`;
    prompt += `- [ ] Documentation updated\n`;
    prompt += `- [ ] No breaking changes\n`;
    prompt += `- [ ] Performance impact considered\n`;
    
    return {
      content: prompt,
      metadata: {
        type: 'pr_description',
        intent: analysis.intent.primary,
        complexity: analysis.complexity.level,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Build prompt content based on template
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @param {Object} template - Prompt template
   * @returns {Promise<string>} Prompt content
   * @private
   */
  async _buildPromptContent(analysis, context, template) {
    let content = `${template.prefix} ${analysis.originalDescription}\n\n`;
    
    // Add sections based on template structure
    for (const section of template.structure) {
      const sectionContent = await this._buildSection(section, analysis, context);
      if (sectionContent) {
        content += sectionContent + '\n\n';
      }
    }
    
    // Add emphasis
    content += `Focus on ${template.emphasis} while following best practices.\n`;
    
    // Add technology-specific instructions
    const techInstructions = this._getTechnologyInstructions(analysis.technologies);
    if (techInstructions) {
      content += techInstructions + '\n';
    }
    
    return content.trim();
  }

  /**
   * Build specific section content
   * @param {string} section - Section type
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {Promise<string>} Section content
   * @private
   */
  async _buildSection(section, analysis, context) {
    switch (section) {
      case 'context':
        return this._buildContextSection(analysis, context);
      
      case 'requirements':
        return this._buildRequirementsSection(analysis);
      
      case 'specifications':
        return this._buildSpecificationsSection(analysis);
      
      case 'examples':
        return this._buildExamplesSection(analysis, context);
      
      case 'constraints':
        return this._buildConstraintsSection(analysis);
      
      case 'current_state':
        return this._buildCurrentStateSection(context);
      
      case 'desired_changes':
        return this._buildDesiredChangesSection(analysis);
      
      case 'problem_description':
        return this._buildProblemDescriptionSection(analysis);
      
      case 'expected_behavior':
        return this._buildExpectedBehaviorSection(analysis);
      
      case 'improvement_goals':
        return this._buildImprovementGoalsSection(analysis);
      
      case 'target_code':
        return this._buildTargetCodeSection(context);
      
      case 'cleanup_requirements':
        return this._buildCleanupRequirementsSection(analysis);
      
      default:
        return null;
    }
  }

  /**
   * Build context section
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {string} Context section
   * @private
   */
  _buildContextSection(analysis, context) {
    let content = '## Context\n';
    
    if (context.repository) {
      content += `Repository: ${context.repository}\n`;
    }
    
    if (analysis.technologies.languages.length > 0) {
      content += `Languages: ${analysis.technologies.languages.join(', ')}\n`;
    }
    
    if (analysis.technologies.frameworks.length > 0) {
      content += `Frameworks: ${analysis.technologies.frameworks.join(', ')}\n`;
    }
    
    if (context.existingCode) {
      content += `Existing Code Context:\n\`\`\`\n${context.existingCode}\n\`\`\`\n`;
    }
    
    return content;
  }

  /**
   * Build requirements section
   * @param {Object} analysis - Task analysis
   * @returns {string} Requirements section
   * @private
   */
  _buildRequirementsSection(analysis) {
    if (analysis.requirements.functional.length === 0) {
      return null;
    }
    
    let content = '## Requirements\n';
    analysis.requirements.functional.forEach(req => {
      content += `- ${req}\n`;
    });
    
    return content;
  }

  /**
   * Build specifications section
   * @param {Object} analysis - Task analysis
   * @returns {string} Specifications section
   * @private
   */
  _buildSpecificationsSection(analysis) {
    let content = '## Specifications\n';
    
    content += `Complexity Level: ${analysis.complexity.level}\n`;
    content += `Estimated Effort: ${analysis.estimatedEffort.estimatedHours} hours\n`;
    
    if (analysis.scope.affectedAreas.length > 0) {
      content += `Affected Areas: ${analysis.scope.affectedAreas.join(', ')}\n`;
    }
    
    if (analysis.fileTypes.length > 0) {
      content += `File Types: ${analysis.fileTypes.join(', ')}\n`;
    }
    
    return content;
  }

  /**
   * Build examples section
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {string} Examples section
   * @private
   */
  _buildExamplesSection(analysis, context) {
    if (!this.config.includeExamples || !context.examples) {
      return null;
    }
    
    let content = '## Examples\n';
    
    if (Array.isArray(context.examples)) {
      context.examples.forEach((example, index) => {
        content += `Example ${index + 1}:\n\`\`\`\n${example}\n\`\`\`\n\n`;
      });
    } else {
      content += `\`\`\`\n${context.examples}\n\`\`\`\n`;
    }
    
    return content;
  }

  /**
   * Build constraints section
   * @param {Object} analysis - Task analysis
   * @returns {string} Constraints section
   * @private
   */
  _buildConstraintsSection(analysis) {
    let content = '## Constraints\n';
    
    // Add risk-based constraints
    if (analysis.riskFactors.length > 0) {
      content += 'Risk Considerations:\n';
      analysis.riskFactors.forEach(risk => {
        content += `- ${risk}\n`;
      });
    }
    
    // Add general constraints
    content += 'General Constraints:\n';
    content += '- Follow existing code patterns\n';
    content += '- Maintain backward compatibility\n';
    content += '- Include proper error handling\n';
    content += '- Add appropriate comments\n';
    
    return content;
  }

  /**
   * Get technology-specific instructions
   * @param {Object} technologies - Identified technologies
   * @returns {string} Technology instructions
   * @private
   */
  _getTechnologyInstructions(technologies) {
    let instructions = '';
    
    technologies.languages.forEach(lang => {
      const practices = this.techBestPractices[lang];
      if (practices) {
        instructions += `\n${lang.toUpperCase()} Best Practices:\n`;
        practices.forEach(practice => {
          instructions += `- ${practice}\n`;
        });
      }
    });
    
    return instructions;
  }

  /**
   * Calculate temperature for generation
   * @param {Object} analysis - Task analysis
   * @returns {number} Temperature value
   * @private
   */
  _calculateTemperature(analysis) {
    // Lower temperature for fixes and refactoring (more deterministic)
    // Higher temperature for creative tasks
    
    const baseTemp = 0.7;
    
    switch (analysis.intent.primary) {
      case 'fix':
        return 0.3;
      case 'refactor':
        return 0.4;
      case 'modify':
        return 0.5;
      case 'create':
        return 0.7;
      default:
        return baseTemp;
    }
  }

  /**
   * Calculate max tokens for generation
   * @param {Object} analysis - Task analysis
   * @returns {number} Max tokens
   * @private
   */
  _calculateMaxTokens(analysis) {
    const baseTokens = 1000;
    
    switch (analysis.complexity.level) {
      case 'simple':
        return baseTokens;
      case 'medium':
        return baseTokens * 2;
      case 'complex':
        return baseTokens * 4;
      default:
        return baseTokens;
    }
  }

  /**
   * Get stop sequences for generation
   * @param {Object} analysis - Task analysis
   * @returns {Array} Stop sequences
   * @private
   */
  _getStopSequences(analysis) {
    // Common stop sequences to prevent over-generation
    return ['```\n\n', '## Next Steps', '## Additional Notes'];
  }

  /**
   * Estimate token count
   * @param {string} content - Prompt content
   * @returns {number} Estimated tokens
   * @private
   */
  _estimateTokens(content) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Validate prompt
   * @param {Object} prompt - Generated prompt
   * @private
   */
  async _validatePrompt(prompt) {
    if (prompt.content.length > this.config.maxPromptLength) {
      log('warning', `Prompt length (${prompt.content.length}) exceeds maximum (${this.config.maxPromptLength})`);
    }
    
    if (prompt.metadata.estimatedTokens > 3000) {
      log('warning', `Estimated token count (${prompt.metadata.estimatedTokens}) is high`);
    }
  }

  /**
   * Optimize prompt for better results
   * @param {Object} prompt - Generated prompt
   * @param {Object} analysis - Task analysis
   * @private
   */
  async _optimizePrompt(prompt, analysis) {
    if (!this.config.optimizeForCodegen) {
      return;
    }
    
    // Add Codegen-specific optimizations
    if (analysis.intent.primary === 'create') {
      prompt.content += '\n\nPlease provide complete, working code with proper structure and documentation.';
    }
    
    if (analysis.complexity.level === 'complex') {
      prompt.content += '\n\nBreak down the implementation into logical steps and explain the approach.';
    }
    
    // Add file structure guidance
    if (analysis.scope.estimatedFiles > 1) {
      prompt.content += '\n\nOrganize the code into appropriate files and provide a clear file structure.';
    }
  }

  // Additional helper methods for building specific sections

  _buildCurrentStateSection(context) {
    if (!context.currentCode) return null;
    
    return `## Current State\n\`\`\`\n${context.currentCode}\n\`\`\`\n`;
  }

  _buildDesiredChangesSection(analysis) {
    return `## Desired Changes\n${analysis.originalDescription}\n`;
  }

  _buildProblemDescriptionSection(analysis) {
    return `## Problem Description\n${analysis.originalDescription}\n`;
  }

  _buildExpectedBehaviorSection(analysis) {
    if (analysis.requirements.functional.length === 0) return null;
    
    let content = '## Expected Behavior\n';
    analysis.requirements.functional.forEach(req => {
      content += `- ${req}\n`;
    });
    return content;
  }

  _buildImprovementGoalsSection(analysis) {
    return `## Improvement Goals\n${analysis.originalDescription}\n`;
  }

  _buildTargetCodeSection(context) {
    if (!context.targetCode) return null;
    
    return `## Target Code\n\`\`\`\n${context.targetCode}\n\`\`\`\n`;
  }

  _buildCleanupRequirementsSection(analysis) {
    return `## Cleanup Requirements\n- Remove specified code safely\n- Update any dependencies\n- Ensure no broken references\n`;
  }
}

export default PromptGenerator;

