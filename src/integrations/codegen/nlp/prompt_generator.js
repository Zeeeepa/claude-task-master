/**
 * @fileoverview Prompt Generator for Codegen API
 * @description Generates optimized prompts for code generation based on task analysis
 */

import { log } from '../../../utils/logger.js';

/**
 * Prompt Generator
 * Creates optimized prompts for Codegen API based on task analysis
 */
export class PromptGenerator {
    constructor(config = {}) {
        this.config = {
            maxPromptLength: config.maxPromptLength || 4000,
            includeContext: config.includeContext !== false,
            includeExamples: config.includeExamples || false,
            optimizeForCodegen: config.optimizeForCodegen !== false,
            templateVersion: config.templateVersion || '1.0',
            ...config
        };
        
        // Prompt templates for different task types
        this.templates = {
            create: {
                prefix: "Create a new",
                structure: [
                    "## Task Description",
                    "## Requirements",
                    "## Technical Specifications",
                    "## Implementation Guidelines",
                    "## Quality Standards"
                ]
            },
            modify: {
                prefix: "Modify the existing",
                structure: [
                    "## Modification Request",
                    "## Current State",
                    "## Desired Changes",
                    "## Implementation Guidelines",
                    "## Testing Requirements"
                ]
            },
            test: {
                prefix: "Create comprehensive tests for",
                structure: [
                    "## Testing Requirements",
                    "## Code to Test",
                    "## Test Cases",
                    "## Coverage Requirements",
                    "## Testing Framework"
                ]
            },
            document: {
                prefix: "Create documentation for",
                structure: [
                    "## Documentation Requirements",
                    "## Code to Document",
                    "## Documentation Format",
                    "## Target Audience",
                    "## Examples and Usage"
                ]
            },
            default: {
                prefix: "Implement",
                structure: [
                    "## Task Overview",
                    "## Requirements",
                    "## Implementation Details",
                    "## Quality Guidelines",
                    "## Deliverables"
                ]
            }
        };
        
        // Quality standards by language
        this.qualityStandards = {
            javascript: {
                style: "Use modern ES6+ syntax, prefer const/let over var",
                testing: "Include Jest unit tests with good coverage",
                documentation: "Use JSDoc comments for functions and classes",
                patterns: "Follow functional programming patterns where appropriate"
            },
            typescript: {
                style: "Use strict TypeScript with proper type annotations",
                testing: "Include Jest/Vitest tests with type safety",
                documentation: "Use TSDoc comments with type information",
                patterns: "Leverage TypeScript's type system for better code safety"
            },
            python: {
                style: "Follow PEP 8 style guidelines",
                testing: "Include pytest tests with good coverage",
                documentation: "Use docstrings following Google or NumPy style",
                patterns: "Use type hints and follow Pythonic patterns"
            },
            react: {
                style: "Use functional components with hooks",
                testing: "Include React Testing Library tests",
                documentation: "Document props and component usage",
                patterns: "Follow React best practices and accessibility guidelines"
            }
        };
        
        log('debug', 'Prompt Generator initialized', {
            maxPromptLength: this.config.maxPromptLength,
            templateVersion: this.config.templateVersion,
            includeContext: this.config.includeContext
        });
    }

    /**
     * Initialize the prompt generator
     * @returns {Promise<void>}
     */
    async initialize() {
        log('info', 'Prompt Generator initialized');
    }

    /**
     * Generate optimized prompt for Codegen API
     * @param {Object} analysis - Task analysis result
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generated prompt
     */
    async generatePrompt(analysis, options = {}) {
        try {
            log('debug', 'Generating prompt', {
                intent: analysis.intent.primary,
                complexity: analysis.complexity.level,
                technologies: analysis.technologies.languages.length
            });
            
            const template = this._selectTemplate(analysis.intent.primary);
            const context = this._buildContext(analysis, options);
            const content = this._buildPromptContent(analysis, template, context, options);
            
            // Optimize prompt length
            const optimizedContent = this._optimizePromptLength(content);
            
            const prompt = {
                content: optimizedContent,
                metadata: {
                    template: template.prefix,
                    intent: analysis.intent.primary,
                    complexity: analysis.complexity.level,
                    technologies: analysis.technologies,
                    promptLength: optimizedContent.length,
                    optimized: optimizedContent.length !== content.length,
                    generatedAt: new Date().toISOString()
                },
                instructions: this._generateInstructions(analysis),
                constraints: this._generateConstraints(analysis, options)
            };
            
            log('debug', 'Prompt generated successfully', {
                length: prompt.content.length,
                optimized: prompt.metadata.optimized,
                template: prompt.metadata.template
            });
            
            return prompt;
            
        } catch (error) {
            log('error', 'Prompt generation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Get generator status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: true,
            config: {
                maxPromptLength: this.config.maxPromptLength,
                includeContext: this.config.includeContext,
                templateVersion: this.config.templateVersion
            },
            templates: Object.keys(this.templates),
            supportedLanguages: Object.keys(this.qualityStandards)
        };
    }

    /**
     * Select appropriate template based on intent
     * @param {string} intent - Primary intent
     * @returns {Object} Selected template
     * @private
     */
    _selectTemplate(intent) {
        return this.templates[intent] || this.templates.default;
    }

    /**
     * Build context information
     * @param {Object} analysis - Task analysis
     * @param {Object} options - Generation options
     * @returns {Object} Context information
     * @private
     */
    _buildContext(analysis, options) {
        const context = {
            languages: analysis.technologies.languages,
            frameworks: analysis.technologies.frameworks,
            complexity: analysis.complexity,
            scope: analysis.scope,
            requirements: analysis.requirements
        };
        
        // Add external context if provided
        if (options.context) {
            Object.assign(context, options.context);
        }
        
        return context;
    }

    /**
     * Build prompt content
     * @param {Object} analysis - Task analysis
     * @param {Object} template - Selected template
     * @param {Object} context - Context information
     * @param {Object} options - Generation options
     * @returns {string} Prompt content
     * @private
     */
    _buildPromptContent(analysis, template, context, options) {
        let content = `${template.prefix} ${this._formatTaskDescription(analysis)}\n\n`;
        
        // Add structured sections
        for (const section of template.structure) {
            content += `${section}\n`;
            content += this._generateSectionContent(section, analysis, context, options);
            content += '\n\n';
        }
        
        // Add quality standards
        if (context.languages.length > 0) {
            content += this._addQualityStandards(context.languages[0].name);
        }
        
        // Add examples if requested
        if (options.includeExamples && this.config.includeExamples) {
            content += this._addExamples(analysis, context);
        }
        
        return content.trim();
    }

    /**
     * Format task description
     * @param {Object} analysis - Task analysis
     * @returns {string} Formatted description
     * @private
     */
    _formatTaskDescription(analysis) {
        let description = analysis.originalDescription;
        
        // Add technology context if identified
        if (analysis.technologies.languages.length > 0) {
            const lang = analysis.technologies.languages[0].name;
            description += ` using ${lang}`;
            
            if (analysis.technologies.frameworks.length > 0) {
                const framework = analysis.technologies.frameworks[0].name;
                description += ` with ${framework}`;
            }
        }
        
        return description;
    }

    /**
     * Generate content for a specific section
     * @param {string} section - Section name
     * @param {Object} analysis - Task analysis
     * @param {Object} context - Context information
     * @param {Object} options - Generation options
     * @returns {string} Section content
     * @private
     */
    _generateSectionContent(section, analysis, context, options) {
        switch (section) {
            case '## Task Description':
            case '## Task Overview':
                return this._generateTaskSection(analysis);
                
            case '## Requirements':
            case '## Testing Requirements':
                return this._generateRequirementsSection(analysis);
                
            case '## Technical Specifications':
            case '## Implementation Details':
                return this._generateTechnicalSection(analysis, context);
                
            case '## Implementation Guidelines':
            case '## Quality Guidelines':
                return this._generateGuidelinesSection(analysis, context);
                
            case '## Quality Standards':
                return this._generateQualitySection(context);
                
            case '## Modification Request':
                return this._generateModificationSection(analysis);
                
            case '## Current State':
                return this._generateCurrentStateSection(context);
                
            case '## Desired Changes':
                return this._generateChangesSection(analysis);
                
            case '## Test Cases':
                return this._generateTestCasesSection(analysis);
                
            case '## Coverage Requirements':
                return this._generateCoverageSection(analysis);
                
            case '## Testing Framework':
                return this._generateTestFrameworkSection(context);
                
            case '## Documentation Format':
                return this._generateDocFormatSection(context);
                
            case '## Target Audience':
                return this._generateAudienceSection(analysis);
                
            case '## Examples and Usage':
                return this._generateUsageSection(analysis, context);
                
            case '## Deliverables':
                return this._generateDeliverablesSection(analysis);
                
            default:
                return '';
        }
    }

    /**
     * Generate task section content
     * @param {Object} analysis - Task analysis
     * @returns {string} Task section content
     * @private
     */
    _generateTaskSection(analysis) {
        let content = `- **Primary Intent**: ${analysis.intent.description}\n`;
        content += `- **Complexity Level**: ${analysis.complexity.level}\n`;
        content += `- **Estimated Effort**: ${analysis.complexity.estimatedHours} hours\n`;
        content += `- **Estimated Files**: ${analysis.complexity.estimatedFiles}\n`;
        
        if (analysis.scope.affectedAreas.length > 0) {
            content += `- **Affected Areas**: ${analysis.scope.affectedAreas.join(', ')}\n`;
        }
        
        return content;
    }

    /**
     * Generate requirements section content
     * @param {Object} analysis - Task analysis
     * @returns {string} Requirements section content
     * @private
     */
    _generateRequirementsSection(analysis) {
        let content = '';
        
        // Functional requirements
        if (analysis.requirements.functional.length > 0) {
            content += '**Functional Requirements:**\n';
            for (const req of analysis.requirements.functional) {
                content += `- ${req.text}\n`;
            }
            content += '\n';
        }
        
        // Non-functional requirements
        const nfReqs = Object.entries(analysis.requirements.nonFunctional);
        if (nfReqs.length > 0) {
            content += '**Non-Functional Requirements:**\n';
            for (const [category, details] of nfReqs) {
                content += `- **${category.charAt(0).toUpperCase() + category.slice(1)}**: Ensure ${category} considerations are addressed\n`;
            }
        }
        
        return content;
    }

    /**
     * Generate technical section content
     * @param {Object} analysis - Task analysis
     * @param {Object} context - Context information
     * @returns {string} Technical section content
     * @private
     */
    _generateTechnicalSection(analysis, context) {
        let content = '';
        
        // Technologies
        if (context.languages.length > 0) {
            content += `**Programming Language**: ${context.languages[0].name}\n`;
        }
        
        if (context.frameworks.length > 0) {
            content += `**Framework**: ${context.frameworks[0].name}\n`;
        }
        
        // Architecture considerations
        if (analysis.complexity.level === 'complex') {
            content += '**Architecture**: Consider modular design with clear separation of concerns\n';
        }
        
        // Database requirements
        if (analysis.technologies.databases.length > 0) {
            content += `**Database**: ${analysis.technologies.databases[0].name}\n`;
        }
        
        return content;
    }

    /**
     * Generate guidelines section content
     * @param {Object} analysis - Task analysis
     * @param {Object} context - Context information
     * @returns {string} Guidelines section content
     * @private
     */
    _generateGuidelinesSection(analysis, context) {
        let content = '';
        
        // Code quality guidelines
        content += '**Code Quality:**\n';
        content += '- Write clean, readable, and maintainable code\n';
        content += '- Follow established coding conventions\n';
        content += '- Include appropriate error handling\n';
        content += '- Add meaningful comments where necessary\n\n';
        
        // Testing guidelines
        content += '**Testing:**\n';
        content += '- Include unit tests for all functions\n';
        content += '- Aim for good test coverage\n';
        content += '- Test edge cases and error conditions\n\n';
        
        // Security guidelines
        if (analysis.requirements.nonFunctional.security) {
            content += '**Security:**\n';
            content += '- Validate all inputs\n';
            content += '- Use secure coding practices\n';
            content += '- Handle sensitive data appropriately\n\n';
        }
        
        return content;
    }

    /**
     * Generate quality section content
     * @param {Object} context - Context information
     * @returns {string} Quality section content
     * @private
     */
    _generateQualitySection(context) {
        if (context.languages.length === 0) {
            return '';
        }
        
        const language = context.languages[0].name;
        const standards = this.qualityStandards[language] || this.qualityStandards.javascript;
        
        let content = '';
        for (const [category, guideline] of Object.entries(standards)) {
            content += `**${category.charAt(0).toUpperCase() + category.slice(1)}**: ${guideline}\n`;
        }
        
        return content;
    }

    /**
     * Add quality standards for specific language
     * @param {string} language - Programming language
     * @returns {string} Quality standards content
     * @private
     */
    _addQualityStandards(language) {
        const standards = this.qualityStandards[language] || this.qualityStandards.javascript;
        
        let content = '## Quality Standards\n';
        for (const [category, guideline] of Object.entries(standards)) {
            content += `**${category.charAt(0).toUpperCase() + category.slice(1)}**: ${guideline}\n`;
        }
        content += '\n';
        
        return content;
    }

    /**
     * Add examples if requested
     * @param {Object} analysis - Task analysis
     * @param {Object} context - Context information
     * @returns {string} Examples content
     * @private
     */
    _addExamples(analysis, context) {
        let content = '## Examples\n';
        
        // Add simple example based on intent and language
        if (context.languages.length > 0) {
            const language = context.languages[0].name;
            content += this._generateLanguageExample(analysis.intent.primary, language);
        }
        
        return content;
    }

    /**
     * Generate language-specific example
     * @param {string} intent - Primary intent
     * @param {string} language - Programming language
     * @returns {string} Example content
     * @private
     */
    _generateLanguageExample(intent, language) {
        const examples = {
            javascript: {
                create: '```javascript\n// Example function structure\nfunction newFunction(param) {\n  // Implementation here\n  return result;\n}\n```\n',
                modify: '```javascript\n// Modified function\nfunction existingFunction(param) {\n  // Updated implementation\n  return updatedResult;\n}\n```\n'
            },
            python: {
                create: '```python\n# Example function structure\ndef new_function(param):\n    """Function description."""\n    # Implementation here\n    return result\n```\n',
                modify: '```python\n# Modified function\ndef existing_function(param):\n    """Updated function description."""\n    # Updated implementation\n    return updated_result\n```\n'
            }
        };
        
        return examples[language]?.[intent] || examples.javascript[intent] || '';
    }

    /**
     * Generate instructions for Codegen
     * @param {Object} analysis - Task analysis
     * @returns {Array} Instructions array
     * @private
     */
    _generateInstructions(analysis) {
        const instructions = [
            'Generate complete, working code',
            'Include appropriate error handling',
            'Add meaningful comments',
            'Follow best practices for the chosen language/framework'
        ];
        
        if (analysis.complexity.level === 'complex') {
            instructions.push('Use modular design patterns');
            instructions.push('Consider scalability and maintainability');
        }
        
        if (analysis.requirements.nonFunctional.security) {
            instructions.push('Implement security best practices');
        }
        
        if (analysis.requirements.nonFunctional.performance) {
            instructions.push('Optimize for performance');
        }
        
        return instructions;
    }

    /**
     * Generate constraints for Codegen
     * @param {Object} analysis - Task analysis
     * @param {Object} options - Generation options
     * @returns {Object} Constraints object
     * @private
     */
    _generateConstraints(analysis, options) {
        const constraints = {
            maxFiles: Math.max(1, analysis.complexity.estimatedFiles),
            estimatedLines: analysis.complexity.estimatedLines,
            complexity: analysis.complexity.level
        };
        
        if (analysis.technologies.languages.length > 0) {
            constraints.language = analysis.technologies.languages[0].name;
        }
        
        if (analysis.technologies.frameworks.length > 0) {
            constraints.framework = analysis.technologies.frameworks[0].name;
        }
        
        // Add custom constraints from options
        if (options.constraints) {
            Object.assign(constraints, options.constraints);
        }
        
        return constraints;
    }

    /**
     * Optimize prompt length to fit within limits
     * @param {string} content - Original content
     * @returns {string} Optimized content
     * @private
     */
    _optimizePromptLength(content) {
        if (content.length <= this.config.maxPromptLength) {
            return content;
        }
        
        log('debug', 'Optimizing prompt length', {
            originalLength: content.length,
            maxLength: this.config.maxPromptLength
        });
        
        // Simple truncation with ellipsis
        // In a real implementation, you might want more sophisticated optimization
        const truncated = content.substring(0, this.config.maxPromptLength - 3) + '...';
        
        return truncated;
    }

    // Placeholder methods for additional sections
    _generateModificationSection(analysis) { return `Modify existing functionality: ${analysis.originalDescription}\n`; }
    _generateCurrentStateSection(context) { return 'Current implementation needs modification\n'; }
    _generateChangesSection(analysis) { return `Required changes: ${analysis.originalDescription}\n`; }
    _generateTestCasesSection(analysis) { return 'Include comprehensive test cases covering all functionality\n'; }
    _generateCoverageSection(analysis) { return 'Aim for 80%+ test coverage\n'; }
    _generateTestFrameworkSection(context) { 
        const lang = context.languages[0]?.name || 'javascript';
        const frameworks = { javascript: 'Jest', python: 'pytest', java: 'JUnit' };
        return `Use ${frameworks[lang] || 'appropriate testing framework'}\n`;
    }
    _generateDocFormatSection(context) { return 'Use clear, comprehensive documentation with examples\n'; }
    _generateAudienceSection(analysis) { return 'Target audience: developers and maintainers\n'; }
    _generateUsageSection(analysis, context) { return 'Include usage examples and common patterns\n'; }
    _generateDeliverablesSection(analysis) { 
        return `- Working code implementation\n- Unit tests\n- Documentation\n- ${analysis.complexity.estimatedFiles} file(s)\n`;
    }
}

export default PromptGenerator;

