/**
 * @fileoverview Prompt Optimizer
 * @description Optimizes prompts for maximum Codegen API effectiveness
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Optimizes prompts for Codegen API calls
 */
export class PromptOptimizer {
    constructor(config = {}) {
        this.config = {
            max_prompt_length: config.max_prompt_length || 8000,
            include_context: config.include_context !== false,
            include_examples: config.include_examples !== false,
            optimization_level: config.optimization_level || 'standard', // 'minimal', 'standard', 'comprehensive'
            ...config
        };
        
        this.templates = new OptimizedPromptTemplates();
        log('debug', 'PromptOptimizer initialized');
    }

    /**
     * Enhance a task prompt for Codegen API
     * @param {Object} task - Task object
     * @param {Object} context - Task context
     * @returns {Promise<Object>} Enhanced prompt
     */
    async enhance(task, context) {
        log('debug', `Optimizing prompt for task: ${task.id}`);
        
        try {
            // Generate base prompt
            const basePrompt = this._generateBasePrompt(task);
            
            // Add contextual information
            const contextualPrompt = this._addContext(basePrompt, context);
            
            // Apply optimization strategies
            const optimizedPrompt = this._optimizeForCodegen(contextualPrompt, task);
            
            // Create final prompt object
            const enhancedPrompt = {
                task_id: task.id,
                content: optimizedPrompt,
                metadata: {
                    task_id: task.id,
                    complexity: task.complexityScore || 5,
                    dependencies: task.dependencies || [],
                    priority: task.priority || 'medium',
                    estimated_effort: task.estimatedEffort || 'medium',
                    language: task.language || 'JavaScript',
                    framework: task.framework || 'Node.js',
                    testing_framework: task.testingFramework || 'Jest',
                    timestamp: new Date().toISOString(),
                    optimization_level: this.config.optimization_level,
                    prompt_length: optimizedPrompt.length
                }
            };
            
            log('debug', `Prompt optimized: ${optimizedPrompt.length} characters`);
            return enhancedPrompt;
            
        } catch (error) {
            log('error', `Prompt optimization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate base prompt from task
     * @param {Object} task - Task object
     * @returns {string} Base prompt
     * @private
     */
    _generateBasePrompt(task) {
        const template = this.templates.getTemplate(task.type || 'implementation');
        
        let prompt = template.base;
        
        // Replace placeholders with task data
        const replacements = {
            '{{TASK_TITLE}}': task.title || 'Untitled Task',
            '{{TASK_DESCRIPTION}}': task.description || 'No description provided',
            '{{REQUIREMENTS}}': this._formatRequirements(task.requirements || []),
            '{{ACCEPTANCE_CRITERIA}}': this._formatAcceptanceCriteria(task.acceptanceCriteria || []),
            '{{AFFECTED_FILES}}': this._formatAffectedFiles(task.affectedFiles || []),
            '{{COMPLEXITY}}': task.complexityScore || 5,
            '{{PRIORITY}}': task.priority || 'medium',
            '{{LANGUAGE}}': task.language || 'JavaScript',
            '{{FRAMEWORK}}': task.framework || 'Node.js',
            '{{TESTING_FRAMEWORK}}': task.testingFramework || 'Jest'
        };
        
        for (const [placeholder, value] of Object.entries(replacements)) {
            prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
        }
        
        return prompt;
    }

    /**
     * Add contextual information to prompt
     * @param {string} basePrompt - Base prompt
     * @param {Object} context - Context object
     * @returns {string} Contextual prompt
     * @private
     */
    _addContext(basePrompt, context) {
        if (!this.config.include_context || !context) {
            return basePrompt;
        }
        
        let contextualPrompt = basePrompt;
        
        // Add codebase context
        if (context.codebase_context) {
            contextualPrompt += '\n\n## Codebase Context\n';
            
            if (context.codebase_context.repository) {
                contextualPrompt += `**Repository**: ${context.codebase_context.repository}\n`;
            }
            
            if (context.codebase_context.branch) {
                contextualPrompt += `**Branch**: ${context.codebase_context.branch}\n`;
            }
            
            if (context.codebase_context.existing_files) {
                contextualPrompt += `**Existing Files**: ${context.codebase_context.existing_files.join(', ')}\n`;
            }
            
            if (context.codebase_context.dependencies) {
                contextualPrompt += `**Dependencies**: ${context.codebase_context.dependencies.join(', ')}\n`;
            }
        }
        
        // Add project context
        if (context.project_context) {
            contextualPrompt += '\n\n## Project Context\n';
            contextualPrompt += `${JSON.stringify(context.project_context, null, 2)}\n`;
        }
        
        // Add related tasks context
        if (context.related_tasks && context.related_tasks.length > 0) {
            contextualPrompt += '\n\n## Related Tasks\n';
            context.related_tasks.forEach((relatedTask, index) => {
                contextualPrompt += `${index + 1}. ${relatedTask.title} (${relatedTask.status})\n`;
            });
        }
        
        return contextualPrompt;
    }

    /**
     * Optimize prompt specifically for Codegen API
     * @param {string} contextualPrompt - Prompt with context
     * @param {Object} task - Task object
     * @returns {string} Optimized prompt
     * @private
     */
    _optimizeForCodegen(contextualPrompt, task) {
        let optimizedPrompt = contextualPrompt;
        
        // Add Codegen-specific instructions
        optimizedPrompt += '\n\n## Implementation Guidelines\n';
        optimizedPrompt += '- Create clean, production-ready code\n';
        optimizedPrompt += '- Follow established patterns and conventions\n';
        optimizedPrompt += '- Include comprehensive error handling\n';
        optimizedPrompt += '- Add appropriate logging and monitoring\n';
        optimizedPrompt += '- Ensure code is well-documented\n';
        optimizedPrompt += '- Include unit tests with good coverage\n';
        optimizedPrompt += '- Follow security best practices\n';
        
        // Add specific technical requirements
        if (task.language === 'JavaScript' || task.language === 'Node.js') {
            optimizedPrompt += '\n## JavaScript/Node.js Specific Requirements\n';
            optimizedPrompt += '- Use ES6+ features and modern syntax\n';
            optimizedPrompt += '- Follow ESLint and Prettier formatting\n';
            optimizedPrompt += '- Use async/await for asynchronous operations\n';
            optimizedPrompt += '- Include proper JSDoc documentation\n';
            optimizedPrompt += '- Handle promises and errors appropriately\n';
        }
        
        // Add testing requirements
        optimizedPrompt += '\n## Testing Requirements\n';
        optimizedPrompt += `- Write tests using ${task.testingFramework || 'Jest'}\n`;
        optimizedPrompt += '- Aim for 90%+ code coverage\n';
        optimizedPrompt += '- Include unit tests for all public methods\n';
        optimizedPrompt += '- Add integration tests for complex workflows\n';
        optimizedPrompt += '- Test error conditions and edge cases\n';
        
        // Add performance considerations
        if (task.complexityScore >= 7) {
            optimizedPrompt += '\n## Performance Considerations\n';
            optimizedPrompt += '- Optimize for performance and scalability\n';
            optimizedPrompt += '- Consider memory usage and garbage collection\n';
            optimizedPrompt += '- Implement caching where appropriate\n';
            optimizedPrompt += '- Use efficient algorithms and data structures\n';
        }
        
        // Add examples if enabled
        if (this.config.include_examples) {
            optimizedPrompt += this._addCodeExamples(task);
        }
        
        // Ensure prompt doesn't exceed max length
        if (optimizedPrompt.length > this.config.max_prompt_length) {
            optimizedPrompt = this._truncatePrompt(optimizedPrompt, this.config.max_prompt_length);
        }
        
        return optimizedPrompt;
    }

    /**
     * Add relevant code examples to prompt
     * @param {Object} task - Task object
     * @returns {string} Code examples section
     * @private
     */
    _addCodeExamples(task) {
        let examples = '\n\n## Code Examples\n';
        
        if (task.type === 'implementation' || task.type === 'feature') {
            examples += `
### Example Implementation Pattern
\`\`\`javascript
export class ${task.title?.replace(/\s+/g, '') || 'NewFeature'} {
    constructor(config = {}) {
        this.config = { ...defaultConfig, ...config };
        this.logger = new Logger('${task.title?.replace(/\s+/g, '') || 'NewFeature'}');
    }

    async execute() {
        try {
            this.logger.info('Starting execution...');
            const result = await this.performOperation();
            this.logger.info('Execution completed successfully');
            return result;
        } catch (error) {
            this.logger.error('Execution failed:', error);
            throw error;
        }
    }

    async performOperation() {
        // Implementation goes here
        throw new Error('Not implemented');
    }
}
\`\`\`
`;
        }
        
        if (task.type === 'bug_fix') {
            examples += `
### Example Bug Fix Pattern
\`\`\`javascript
// Before: Problematic code
function problematicFunction(input) {
    return input.someProperty; // Potential null reference
}

// After: Fixed code with proper validation
function fixedFunction(input) {
    if (!input || typeof input !== 'object') {
        throw new Error('Invalid input: expected object');
    }
    
    return input.someProperty || null;
}
\`\`\`
`;
        }
        
        // Add testing example
        examples += `
### Example Test Pattern
\`\`\`javascript
describe('${task.title?.replace(/\s+/g, '') || 'NewFeature'}', () => {
    let instance;

    beforeEach(() => {
        instance = new ${task.title?.replace(/\s+/g, '') || 'NewFeature'}();
    });

    test('should execute successfully with valid input', async () => {
        const result = await instance.execute();
        expect(result).toBeDefined();
    });

    test('should handle errors gracefully', async () => {
        // Test error conditions
        await expect(instance.performOperation()).rejects.toThrow();
    });
});
\`\`\`
`;
        
        return examples;
    }

    /**
     * Truncate prompt to fit within length limits
     * @param {string} prompt - Original prompt
     * @param {number} maxLength - Maximum allowed length
     * @returns {string} Truncated prompt
     * @private
     */
    _truncatePrompt(prompt, maxLength) {
        if (prompt.length <= maxLength) {
            return prompt;
        }
        
        log('warning', `Prompt too long (${prompt.length} chars), truncating to ${maxLength} chars`);
        
        // Try to truncate at a natural break point
        const truncated = prompt.substring(0, maxLength - 100);
        const lastNewline = truncated.lastIndexOf('\n');
        
        if (lastNewline > maxLength * 0.8) {
            return truncated.substring(0, lastNewline) + '\n\n[Prompt truncated due to length limits]';
        }
        
        return truncated + '\n\n[Prompt truncated due to length limits]';
    }

    /**
     * Format requirements list
     * @param {Array} requirements - Requirements array
     * @returns {string} Formatted requirements
     * @private
     */
    _formatRequirements(requirements) {
        if (!requirements || requirements.length === 0) {
            return 'No specific requirements provided.';
        }
        
        return requirements.map((req, index) => `${index + 1}. ${req}`).join('\n');
    }

    /**
     * Format acceptance criteria list
     * @param {Array} criteria - Acceptance criteria array
     * @returns {string} Formatted criteria
     * @private
     */
    _formatAcceptanceCriteria(criteria) {
        if (!criteria || criteria.length === 0) {
            return 'No specific acceptance criteria provided.';
        }
        
        return criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
    }

    /**
     * Format affected files list
     * @param {Array} files - Affected files array
     * @returns {string} Formatted files
     * @private
     */
    _formatAffectedFiles(files) {
        if (!files || files.length === 0) {
            return 'No specific files mentioned.';
        }
        
        return files.join(', ');
    }

    /**
     * Get optimizer health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            templates_loaded: this.templates.getTemplateCount(),
            optimization_level: this.config.optimization_level,
            max_prompt_length: this.config.max_prompt_length
        };
    }
}

/**
 * Optimized prompt templates for different task types
 */
class OptimizedPromptTemplates {
    constructor() {
        this.templates = {
            implementation: {
                version: '2.0.0',
                base: `# Implementation Task: {{TASK_TITLE}}

## Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Specifications
- **Language**: {{LANGUAGE}}
- **Framework**: {{FRAMEWORK}}
- **Testing Framework**: {{TESTING_FRAMEWORK}}
- **Complexity Level**: {{COMPLEXITY}}/10
- **Priority**: {{PRIORITY}}
- **Affected Files**: {{AFFECTED_FILES}}

## Deliverables
Please implement this feature with the following deliverables:
1. Clean, production-ready code following best practices
2. Comprehensive error handling and input validation
3. Unit tests with 90%+ coverage
4. Integration tests for complex workflows
5. Proper documentation (JSDoc/comments)
6. Security considerations implemented
7. Performance optimizations where applicable`
            },
            
            bug_fix: {
                version: '2.0.0',
                base: `# Bug Fix: {{TASK_TITLE}}

## Bug Description
{{TASK_DESCRIPTION}}

## Root Cause Analysis Required
{{REQUIREMENTS}}

## Fix Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Details
- **Language**: {{LANGUAGE}}
- **Framework**: {{FRAMEWORK}}
- **Testing Framework**: {{TESTING_FRAMEWORK}}
- **Complexity Level**: {{COMPLEXITY}}/10
- **Priority**: {{PRIORITY}}
- **Affected Files**: {{AFFECTED_FILES}}

## Fix Requirements
1. Identify and address the root cause
2. Implement a robust solution that prevents recurrence
3. Add regression tests to prevent future issues
4. Ensure backward compatibility
5. Document the fix and any breaking changes
6. Consider performance impact of the fix`
            },
            
            feature: {
                version: '2.0.0',
                base: `# Feature Development: {{TASK_TITLE}}

## Feature Overview
{{TASK_DESCRIPTION}}

## Feature Requirements
{{REQUIREMENTS}}

## Success Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Architecture
- **Language**: {{LANGUAGE}}
- **Framework**: {{FRAMEWORK}}
- **Testing Framework**: {{TESTING_FRAMEWORK}}
- **Complexity Level**: {{COMPLEXITY}}/10
- **Priority**: {{PRIORITY}}
- **Affected Files**: {{AFFECTED_FILES}}

## Implementation Strategy
1. Design scalable and maintainable architecture
2. Implement core functionality with proper abstractions
3. Add comprehensive error handling and validation
4. Create extensive test suite (unit + integration)
5. Ensure feature flags and gradual rollout capability
6. Document API and usage patterns
7. Consider monitoring and observability needs`
            },
            
            refactor: {
                version: '2.0.0',
                base: `# Code Refactoring: {{TASK_TITLE}}

## Refactoring Objective
{{TASK_DESCRIPTION}}

## Refactoring Requirements
{{REQUIREMENTS}}

## Quality Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Context
- **Language**: {{LANGUAGE}}
- **Framework**: {{FRAMEWORK}}
- **Testing Framework**: {{TESTING_FRAMEWORK}}
- **Complexity Level**: {{COMPLEXITY}}/10
- **Priority**: {{PRIORITY}}
- **Affected Files**: {{AFFECTED_FILES}}

## Refactoring Guidelines
1. Maintain existing functionality (no breaking changes)
2. Improve code readability and maintainability
3. Enhance performance where possible
4. Reduce technical debt and code duplication
5. Ensure all existing tests continue to pass
6. Add tests for any new abstractions
7. Update documentation to reflect changes`
            }
        };
    }

    /**
     * Get template by type
     * @param {string} type - Template type
     * @returns {Object} Template object
     */
    getTemplate(type) {
        return this.templates[type] || this.templates.implementation;
    }

    /**
     * Get number of loaded templates
     * @returns {number} Template count
     */
    getTemplateCount() {
        return Object.keys(this.templates).length;
    }
}

export default PromptOptimizer;

