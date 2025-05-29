/**
 * @fileoverview Intelligent Prompt Generator
 * @description Advanced prompt generation with templates and optimization for Codegen API
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Intelligent prompt generator for Codegen API requests
 */
export class PromptGenerator {
    constructor(config = {}) {
        this.config = {
            maxPromptLength: config.maxPromptLength || 8000,
            enableTemplates: config.enableTemplates !== false,
            enableOptimization: config.enableOptimization !== false,
            includeExamples: config.includeExamples || false,
            templateVersion: config.templateVersion || '1.0',
            ...config
        };

        // Initialize template manager
        this.templateManager = new TemplateManager(this.config);
        this.promptOptimizer = new PromptOptimizer(this.config);
        this.contextEnricher = new ContextEnricher(this.config);

        log('info', 'Prompt generator initialized');
    }

    /**
     * Generate optimized prompt for Codegen API
     * @param {Object} structuredTask - Processed task structure
     * @param {Object} context - Additional context
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generated prompt with metadata
     */
    async generatePrompt(structuredTask, context = {}, options = {}) {
        try {
            log('debug', 'Generating prompt', {
                taskType: structuredTask.type,
                complexity: structuredTask.complexity.level
            });

            // Step 1: Select appropriate template
            const template = await this.templateManager.selectTemplate(structuredTask);

            // Step 2: Enrich context with codebase information
            const enrichedContext = await this.contextEnricher.enrich(context, structuredTask);

            // Step 3: Generate prompt from template
            const rawPrompt = await this.templateManager.generateFromTemplate(
                template,
                structuredTask,
                enrichedContext,
                options
            );

            // Step 4: Optimize prompt for length and clarity
            const optimizedPrompt = await this.promptOptimizer.optimize(rawPrompt, structuredTask);

            // Step 5: Generate metadata
            const metadata = this._generatePromptMetadata(optimizedPrompt, structuredTask, template);

            const result = {
                prompt: optimizedPrompt.content,
                metadata,
                template: template.name,
                optimization: optimizedPrompt.optimization,
                context: enrichedContext
            };

            log('info', 'Prompt generated successfully', {
                length: result.prompt.length,
                template: result.template,
                optimized: result.optimization.applied
            });

            return result;

        } catch (error) {
            log('error', 'Prompt generation failed', { error: error.message });
            throw new PromptGenerationError(`Failed to generate prompt: ${error.message}`, 'GENERATION_ERROR', error);
        }
    }

    /**
     * Validate generated prompt quality
     * @param {Object} promptData - Generated prompt data
     * @returns {Promise<Object>} Validation results
     */
    async validatePrompt(promptData) {
        try {
            const { prompt, metadata, template } = promptData;
            
            const validation = {
                isValid: true,
                score: 0,
                issues: [],
                suggestions: [],
                metrics: {}
            };

            // 1. Length validation
            validation.metrics.length = this._validateLength(prompt);
            if (!validation.metrics.length.isValid) {
                validation.isValid = false;
                validation.issues.push(validation.metrics.length.issue);
            }

            // 2. Structure validation
            validation.metrics.structure = this._validateStructure(prompt, template);
            validation.score += validation.metrics.structure.score * 0.3;

            // 3. Clarity validation
            validation.metrics.clarity = this._validateClarity(prompt);
            validation.score += validation.metrics.clarity.score * 0.3;

            // 4. Completeness validation
            validation.metrics.completeness = this._validateCompleteness(prompt, metadata);
            validation.score += validation.metrics.completeness.score * 0.4;

            // 5. Generate improvement suggestions
            validation.suggestions = this._generateSuggestions(validation.metrics);

            // Final score (0-100)
            validation.score = Math.round(validation.score * 100);

            log('debug', 'Prompt validation completed', {
                score: validation.score,
                isValid: validation.isValid
            });

            return validation;

        } catch (error) {
            log('error', 'Prompt validation failed', { error: error.message });
            throw new PromptGenerationError(`Failed to validate prompt: ${error.message}`, 'VALIDATION_ERROR', error);
        }
    }

    /**
     * Generate prompt metadata
     * @private
     */
    _generatePromptMetadata(optimizedPrompt, structuredTask, template) {
        return {
            taskId: structuredTask.id,
            taskType: structuredTask.type,
            complexity: structuredTask.complexity.level,
            template: template.name,
            templateVersion: template.version,
            length: optimizedPrompt.content.length,
            estimatedTokens: Math.ceil(optimizedPrompt.content.length / 4),
            sections: optimizedPrompt.sections || [],
            optimized: optimizedPrompt.optimization.applied,
            generatedAt: new Date().toISOString(),
            version: this.config.templateVersion
        };
    }

    /**
     * Validate prompt length
     * @private
     */
    _validateLength(prompt) {
        const length = prompt.length;
        const maxLength = this.config.maxPromptLength;
        
        return {
            isValid: length <= maxLength && length >= 100,
            length,
            maxLength,
            issue: length > maxLength ? `Prompt too long: ${length} > ${maxLength}` :
                   length < 100 ? `Prompt too short: ${length} < 100` : null
        };
    }

    /**
     * Validate prompt structure
     * @private
     */
    _validateStructure(prompt, template) {
        let score = 0.5; // Base score
        
        // Check for required sections based on template
        const requiredSections = template.requiredSections || [];
        const presentSections = requiredSections.filter(section => 
            prompt.includes(section)
        );
        
        if (requiredSections.length > 0) {
            score = presentSections.length / requiredSections.length;
        }
        
        return {
            score,
            requiredSections,
            presentSections,
            missingSections: requiredSections.filter(section => !prompt.includes(section))
        };
    }

    /**
     * Validate prompt clarity
     * @private
     */
    _validateClarity(prompt) {
        let score = 0.5; // Base score
        
        // Check for clear structure
        const hasHeaders = /^#+\s/m.test(prompt);
        if (hasHeaders) score += 0.2;
        
        // Check for bullet points or lists
        const hasLists = /^[-*]\s/m.test(prompt);
        if (hasLists) score += 0.1;
        
        // Check for code blocks
        const hasCodeBlocks = /```/.test(prompt);
        if (hasCodeBlocks) score += 0.1;
        
        // Check for clear objectives
        const hasObjectives = /objective|goal|purpose/i.test(prompt);
        if (hasObjectives) score += 0.1;
        
        return {
            score: Math.min(score, 1.0),
            hasHeaders,
            hasLists,
            hasCodeBlocks,
            hasObjectives
        };
    }

    /**
     * Validate prompt completeness
     * @private
     */
    _validateCompleteness(prompt, metadata) {
        let score = 0;
        const requiredElements = [
            'task description',
            'requirements',
            'expected output',
            'context'
        ];
        
        const presentElements = requiredElements.filter(element => {
            const regex = new RegExp(element.replace(' ', '\\s+'), 'i');
            return regex.test(prompt);
        });
        
        score = presentElements.length / requiredElements.length;
        
        return {
            score,
            requiredElements,
            presentElements,
            missingElements: requiredElements.filter(element => 
                !presentElements.includes(element)
            )
        };
    }

    /**
     * Generate improvement suggestions
     * @private
     */
    _generateSuggestions(metrics) {
        const suggestions = [];
        
        if (metrics.structure.score < 0.8) {
            suggestions.push(`Add missing sections: ${metrics.structure.missingSections.join(', ')}`);
        }
        
        if (metrics.clarity.score < 0.7) {
            suggestions.push('Improve clarity with headers, lists, and clear objectives');
        }
        
        if (metrics.completeness.score < 0.8) {
            suggestions.push(`Include missing elements: ${metrics.completeness.missingElements.join(', ')}`);
        }
        
        return suggestions;
    }
}

/**
 * Template manager for prompt templates
 */
class TemplateManager {
    constructor(config) {
        this.config = config;
        this.templates = this._initializeTemplates();
    }

    /**
     * Select appropriate template based on task type
     * @param {Object} structuredTask - Task structure
     * @returns {Promise<Object>} Selected template
     */
    async selectTemplate(structuredTask) {
        const taskType = structuredTask.type;
        const complexity = structuredTask.complexity.level;
        
        // Select template based on task type and complexity
        let templateName = `${taskType}_${complexity}`;
        
        if (!this.templates[templateName]) {
            templateName = taskType;
        }
        
        if (!this.templates[templateName]) {
            templateName = 'default';
        }
        
        const template = this.templates[templateName];
        
        log('debug', 'Template selected', {
            taskType,
            complexity,
            templateName: template.name
        });
        
        return template;
    }

    /**
     * Generate prompt from template
     * @param {Object} template - Selected template
     * @param {Object} structuredTask - Task structure
     * @param {Object} context - Enriched context
     * @param {Object} options - Generation options
     * @returns {Promise<string>} Generated prompt
     */
    async generateFromTemplate(template, structuredTask, context, options) {
        try {
            let prompt = template.content;
            
            // Replace template variables
            const variables = {
                '{{TASK_TYPE}}': structuredTask.type.toUpperCase(),
                '{{TASK_DESCRIPTION}}': structuredTask.originalDescription,
                '{{OBJECTIVES}}': this._formatList(structuredTask.objectives),
                '{{REQUIREMENTS}}': this._formatList(structuredTask.requirements),
                '{{CONSTRAINTS}}': this._formatList(structuredTask.constraints),
                '{{DELIVERABLES}}': this._formatList(structuredTask.deliverables),
                '{{COMPLEXITY}}': structuredTask.complexity.level,
                '{{TECHNOLOGIES}}': this._formatList(structuredTask.technologies),
                '{{CONTEXT}}': this._formatContext(context),
                '{{BEST_PRACTICES}}': this._formatList(structuredTask.bestPractices),
                '{{TIMESTAMP}}': new Date().toISOString()
            };
            
            // Replace all variables
            for (const [variable, value] of Object.entries(variables)) {
                prompt = prompt.replace(new RegExp(variable, 'g'), value || 'Not specified');
            }
            
            // Add optional sections based on options
            if (options.includeExamples && template.examples) {
                prompt += '\n\n' + template.examples;
            }
            
            return prompt;
            
        } catch (error) {
            throw new PromptGenerationError(`Template generation failed: ${error.message}`, 'TEMPLATE_ERROR', error);
        }
    }

    /**
     * Initialize prompt templates
     * @private
     */
    _initializeTemplates() {
        return {
            default: {
                name: 'default',
                version: '1.0',
                requiredSections: ['# Task', '## Objective', '## Requirements', '## Output'],
                content: `# Task: {{TASK_TYPE}}

## Objective
{{OBJECTIVES}}

## Task Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Constraints
{{CONSTRAINTS}}

## Context
{{CONTEXT}}

## Technologies
{{TECHNOLOGIES}}

## Best Practices
{{BEST_PRACTICES}}

## Expected Output
{{DELIVERABLES}}

Please implement this task following the requirements and best practices outlined above. Ensure the solution is production-ready, well-tested, and properly documented.`
            },

            feature_development: {
                name: 'feature_development',
                version: '1.0',
                requiredSections: ['# Feature Development', '## Objective', '## Requirements', '## Implementation'],
                content: `# Feature Development: {{TASK_TYPE}}

## Objective
{{OBJECTIVES}}

## Feature Description
{{TASK_DESCRIPTION}}

## Functional Requirements
{{REQUIREMENTS}}

## Technical Constraints
{{CONSTRAINTS}}

## Implementation Context
{{CONTEXT}}

## Technology Stack
{{TECHNOLOGIES}}

## Development Best Practices
{{BEST_PRACTICES}}

## Implementation Requirements
- Create clean, maintainable code
- Include comprehensive unit tests
- Follow existing code patterns and conventions
- Add proper error handling and validation
- Update documentation as needed

## Deliverables
{{DELIVERABLES}}

## Quality Standards
- Code coverage > 80%
- All tests passing
- No linting errors
- Performance considerations addressed
- Security best practices followed

Please implement this feature with production-quality code and comprehensive testing.`
            },

            bug_fix: {
                name: 'bug_fix',
                version: '1.0',
                requiredSections: ['# Bug Fix', '## Problem', '## Solution', '## Testing'],
                content: `# Bug Fix: {{TASK_TYPE}}

## Problem Description
{{TASK_DESCRIPTION}}

## Root Cause Analysis
{{OBJECTIVES}}

## Requirements for Fix
{{REQUIREMENTS}}

## Constraints and Limitations
{{CONSTRAINTS}}

## Context and Environment
{{CONTEXT}}

## Technologies Involved
{{TECHNOLOGIES}}

## Fix Implementation Guidelines
{{BEST_PRACTICES}}

## Solution Requirements
- Identify and fix the root cause
- Ensure no regression in existing functionality
- Add tests to prevent future occurrences
- Document the fix and its reasoning
- Consider edge cases and error scenarios

## Testing Strategy
- Unit tests for the fixed functionality
- Integration tests to verify system behavior
- Regression tests for related features
- Manual testing scenarios if applicable

## Deliverables
{{DELIVERABLES}}

Please provide a comprehensive fix that addresses the root cause and prevents similar issues in the future.`
            },

            refactoring: {
                name: 'refactoring',
                version: '1.0',
                requiredSections: ['# Refactoring', '## Current State', '## Target State', '## Migration'],
                content: `# Code Refactoring: {{TASK_TYPE}}

## Refactoring Objective
{{OBJECTIVES}}

## Current State Analysis
{{TASK_DESCRIPTION}}

## Refactoring Requirements
{{REQUIREMENTS}}

## Constraints and Considerations
{{CONSTRAINTS}}

## Codebase Context
{{CONTEXT}}

## Technologies and Patterns
{{TECHNOLOGIES}}

## Refactoring Best Practices
{{BEST_PRACTICES}}

## Refactoring Guidelines
- Maintain existing functionality (no behavior changes)
- Improve code readability and maintainability
- Reduce technical debt
- Follow SOLID principles
- Ensure backward compatibility where required
- Update tests to reflect structural changes

## Quality Metrics
- Reduced cyclomatic complexity
- Improved code coverage
- Better separation of concerns
- Enhanced testability
- Clearer naming conventions

## Deliverables
{{DELIVERABLES}}

## Migration Strategy
- Plan refactoring in small, incremental steps
- Ensure all tests pass after each step
- Document any breaking changes
- Provide migration guide if needed

Please refactor the code while maintaining all existing functionality and improving overall code quality.`
            },

            testing: {
                name: 'testing',
                version: '1.0',
                requiredSections: ['# Testing', '## Test Strategy', '## Test Cases', '## Coverage'],
                content: `# Testing Implementation: {{TASK_TYPE}}

## Testing Objective
{{OBJECTIVES}}

## Testing Scope
{{TASK_DESCRIPTION}}

## Testing Requirements
{{REQUIREMENTS}}

## Testing Constraints
{{CONSTRAINTS}}

## Application Context
{{CONTEXT}}

## Testing Technologies
{{TECHNOLOGIES}}

## Testing Best Practices
{{BEST_PRACTICES}}

## Test Strategy
- Unit tests for individual components
- Integration tests for component interactions
- End-to-end tests for user workflows
- Performance tests for critical paths
- Security tests for sensitive operations

## Test Coverage Requirements
- Minimum 80% code coverage
- 100% coverage for critical business logic
- Edge cases and error scenarios
- Boundary value testing
- Negative test cases

## Test Implementation Guidelines
- Use appropriate testing frameworks
- Follow AAA pattern (Arrange, Act, Assert)
- Create maintainable and readable tests
- Mock external dependencies appropriately
- Include both positive and negative test cases

## Deliverables
{{DELIVERABLES}}

Please implement comprehensive tests that ensure code quality and reliability.`
            }
        };
    }

    /**
     * Format list items for template
     * @private
     */
    _formatList(items) {
        if (!items || items.length === 0) return 'None specified';
        return items.map(item => `- ${item}`).join('\n');
    }

    /**
     * Format context for template
     * @private
     */
    _formatContext(context) {
        if (!context || Object.keys(context).length === 0) {
            return 'No additional context provided';
        }
        
        let formatted = '';
        
        if (context.codebase) {
            formatted += `### Codebase Context\n${context.codebase}\n\n`;
        }
        
        if (context.dependencies && context.dependencies.length > 0) {
            formatted += `### Dependencies\n${context.dependencies.map(dep => `- ${dep}`).join('\n')}\n\n`;
        }
        
        if (context.relatedFiles && context.relatedFiles.length > 0) {
            formatted += `### Related Files\n${context.relatedFiles.map(file => `- ${file}`).join('\n')}\n\n`;
        }
        
        return formatted.trim() || 'Context information will be provided by the system';
    }
}

/**
 * Prompt optimizer for length and quality optimization
 */
class PromptOptimizer {
    constructor(config) {
        this.config = config;
    }

    /**
     * Optimize prompt for length and clarity
     * @param {string} prompt - Raw prompt
     * @param {Object} structuredTask - Task structure
     * @returns {Promise<Object>} Optimized prompt with metadata
     */
    async optimize(prompt, structuredTask) {
        try {
            let optimizedContent = prompt;
            const optimization = {
                applied: false,
                originalLength: prompt.length,
                optimizedLength: 0,
                techniques: []
            };

            // Check if optimization is needed
            if (prompt.length > this.config.maxPromptLength) {
                optimizedContent = await this._optimizeLength(prompt, structuredTask);
                optimization.applied = true;
                optimization.techniques.push('length_optimization');
            }

            // Apply clarity optimizations
            optimizedContent = this._optimizeClarity(optimizedContent);
            if (optimizedContent !== prompt) {
                optimization.applied = true;
                optimization.techniques.push('clarity_optimization');
            }

            optimization.optimizedLength = optimizedContent.length;

            return {
                content: optimizedContent,
                optimization,
                sections: this._extractSections(optimizedContent)
            };

        } catch (error) {
            throw new PromptGenerationError(`Prompt optimization failed: ${error.message}`, 'OPTIMIZATION_ERROR', error);
        }
    }

    /**
     * Optimize prompt length
     * @private
     */
    async _optimizeLength(prompt, structuredTask) {
        const maxLength = this.config.maxPromptLength;
        let optimized = prompt;

        // Priority-based section trimming
        const sectionPriority = [
            '# Task',
            '## Objective',
            '## Requirements',
            '## Expected Output',
            '## Context',
            '## Best Practices',
            '## Examples'
        ];

        // If still too long, apply more aggressive optimization
        if (optimized.length > maxLength) {
            // Remove less critical sections first
            const sections = optimized.split(/^##?\s/m);
            const criticalSections = sections.slice(0, Math.ceil(sections.length * 0.7));
            optimized = criticalSections.join('## ');
        }

        // Final truncation if still too long
        if (optimized.length > maxLength) {
            optimized = optimized.substring(0, maxLength - 100) + '\n\n[Content optimized for length]';
        }

        return optimized;
    }

    /**
     * Optimize prompt clarity
     * @private
     */
    _optimizeClarity(prompt) {
        let optimized = prompt;

        // Ensure proper markdown formatting
        optimized = optimized.replace(/^([^#\n].*?)$/gm, (match, line) => {
            if (line.trim() && !line.startsWith('-') && !line.startsWith('*')) {
                return line;
            }
            return match;
        });

        // Ensure proper spacing
        optimized = optimized.replace(/\n{3,}/g, '\n\n');

        // Clean up list formatting
        optimized = optimized.replace(/^[\s]*[-*]\s*/gm, '- ');

        return optimized;
    }

    /**
     * Extract sections from prompt
     * @private
     */
    _extractSections(prompt) {
        const sections = [];
        const lines = prompt.split('\n');
        
        for (const line of lines) {
            if (line.match(/^#+\s/)) {
                sections.push(line.trim());
            }
        }
        
        return sections;
    }
}

/**
 * Context enricher for adding codebase context
 */
class ContextEnricher {
    constructor(config) {
        this.config = config;
    }

    /**
     * Enrich context with codebase information
     * @param {Object} context - Base context
     * @param {Object} structuredTask - Task structure
     * @returns {Promise<Object>} Enriched context
     */
    async enrich(context, structuredTask) {
        try {
            const enriched = { ...context };

            // Add task-specific context
            enriched.taskType = structuredTask.type;
            enriched.complexity = structuredTask.complexity.level;
            enriched.technologies = structuredTask.technologies;

            // Add codebase context (would be populated by actual codebase analysis)
            if (!enriched.codebase) {
                enriched.codebase = 'Codebase context will be provided by the system';
            }

            // Add dependency context
            if (!enriched.dependencies) {
                enriched.dependencies = structuredTask.technologies || [];
            }

            // Add file context
            if (!enriched.relatedFiles) {
                enriched.relatedFiles = [];
            }

            return enriched;

        } catch (error) {
            log('warn', 'Context enrichment failed, using base context', { error: error.message });
            return context;
        }
    }
}

/**
 * Custom error class for prompt generation operations
 */
export class PromptGenerationError extends Error {
    constructor(message, code = 'PROMPT_ERROR', originalError = null) {
        super(message);
        this.name = 'PromptGenerationError';
        this.code = code;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, PromptGenerationError);
        }
    }
}

export default PromptGenerator;

