/**
 * @fileoverview Unified Prompt Generator
 * @description Consolidated prompt generation from PRs #52, #54, #86
 */

import { log } from '../../../utils/logger.js';

/**
 * Prompt generation error
 */
export class PromptGenerationError extends Error {
    constructor(message, code = null) {
        super(message);
        this.name = 'PromptGenerationError';
        this.code = code;
    }
}

/**
 * Unified Prompt Generator
 * Consolidates prompt generation patterns from multiple PRs
 */
export class PromptGenerator {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            maxPromptLength: config.maxPromptLength || 8000,
            enableTemplates: config.enableTemplates !== false,
            enableOptimization: config.enableOptimization !== false,
            includeExamples: config.includeExamples || false,
            includeContext: config.includeContext !== false,
            templateVersion: config.templateVersion || '2.0',
            optimizeForCodegen: config.optimizeForCodegen !== false,
            ...config
        };

        // Initialize templates
        this.templates = this._initializeTemplates();
        this.examples = this._initializeExamples();
        this.optimizationRules = this._initializeOptimizationRules();
        
        log('debug', 'Prompt Generator initialized', {
            enabled: this.config.enabled,
            templateVersion: this.config.templateVersion,
            maxLength: this.config.maxPromptLength
        });
    }

    /**
     * Initialize the generator
     * @returns {Promise<void>}
     */
    async initialize() {
        if (!this.config.enabled) {
            log('info', 'Prompt Generator disabled');
            return;
        }

        log('info', 'Initializing Prompt Generator...');
        
        // Pre-compile templates
        this._compileTemplates();
        
        log('info', 'Prompt Generator initialized successfully');
    }

    /**
     * Generate optimized prompt for Codegen API
     * @param {Object} analysis - Task analysis result
     * @param {Object} context - Context information
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generated prompt
     */
    async generatePrompt(analysis, context = {}, options = {}) {
        try {
            log('debug', 'Generating prompt', {
                intent: analysis.intent?.primary,
                complexity: analysis.complexity?.level,
                includeContext: options.includeContext !== false
            });

            // Select appropriate template
            const template = this._selectTemplate(analysis, options);
            
            // Build prompt sections
            const sections = await this._buildPromptSections(analysis, context, options, template);
            
            // Assemble final prompt
            const prompt = this._assemblePrompt(sections, template);
            
            // Optimize prompt if enabled
            const optimizedPrompt = this.config.enableOptimization ? 
                this._optimizePrompt(prompt, analysis) : prompt;
            
            // Validate prompt length
            this._validatePromptLength(optimizedPrompt);
            
            const result = {
                content: optimizedPrompt,
                metadata: {
                    template: template.name,
                    sections: Object.keys(sections),
                    length: optimizedPrompt.length,
                    optimized: this.config.enableOptimization,
                    version: this.config.templateVersion,
                    generatedAt: new Date().toISOString()
                },
                instructions: template.instructions || [],
                constraints: template.constraints || []
            };

            log('debug', 'Prompt generated successfully', {
                template: template.name,
                length: result.content.length,
                sections: result.metadata.sections.length
            });

            return result;

        } catch (error) {
            log('error', 'Prompt generation failed', { error: error.message });
            throw new PromptGenerationError(`Generation failed: ${error.message}`, 'GENERATION_FAILED');
        }
    }

    /**
     * Select appropriate template based on analysis
     * @param {Object} analysis - Task analysis
     * @param {Object} options - Options
     * @returns {Object} Selected template
     * @private
     */
    _selectTemplate(analysis, options) {
        const intent = analysis.intent?.primary || 'unknown';
        const complexity = analysis.complexity?.level || 'medium';
        
        // Template selection priority
        const templatePriority = [
            `${intent}_${complexity}`,
            intent,
            complexity,
            'default'
        ];

        for (const templateName of templatePriority) {
            if (this.templates[templateName]) {
                log('debug', `Selected template: ${templateName}`);
                return { name: templateName, ...this.templates[templateName] };
            }
        }

        // Fallback to default template
        return { name: 'default', ...this.templates.default };
    }

    /**
     * Build prompt sections
     * @param {Object} analysis - Task analysis
     * @param {Object} context - Context information
     * @param {Object} options - Options
     * @param {Object} template - Selected template
     * @returns {Promise<Object>} Prompt sections
     * @private
     */
    async _buildPromptSections(analysis, context, options, template) {
        const sections = {};

        // Task description section
        sections.task = this._buildTaskSection(analysis);

        // Requirements section
        if (analysis.requirements && template.includeRequirements !== false) {
            sections.requirements = this._buildRequirementsSection(analysis.requirements);
        }

        // Context section
        if (options.includeContext !== false && context.summary) {
            sections.context = this._buildContextSection(context);
        }

        // Technology section
        if (analysis.technologies && template.includeTechnologies !== false) {
            sections.technologies = this._buildTechnologiesSection(analysis.technologies);
        }

        // Quality guidelines section
        if (template.includeQuality !== false) {
            sections.quality = this._buildQualitySection(analysis);
        }

        // Examples section
        if (options.includeExamples && template.includeExamples !== false) {
            sections.examples = this._buildExamplesSection(analysis, template);
        }

        // Constraints section
        if (template.constraints && template.constraints.length > 0) {
            sections.constraints = this._buildConstraintsSection(template.constraints);
        }

        return sections;
    }

    /**
     * Build task description section
     * @param {Object} analysis - Task analysis
     * @returns {string} Task section
     * @private
     */
    _buildTaskSection(analysis) {
        const intent = analysis.intent?.primary || 'implement';
        const description = analysis.originalDescription;
        const complexity = analysis.complexity?.level || 'medium';

        return `## Task Description

**Intent**: ${intent}
**Complexity**: ${complexity}
**Description**: ${description}

${analysis.intent?.description || ''}`;
    }

    /**
     * Build requirements section
     * @param {Object} requirements - Requirements object
     * @returns {string} Requirements section
     * @private
     */
    _buildRequirementsSection(requirements) {
        let section = '## Requirements\n\n';

        // Functional requirements
        if (requirements.functional && requirements.functional.length > 0) {
            section += '### Functional Requirements\n';
            requirements.functional.forEach((req, index) => {
                section += `${index + 1}. ${req.text}\n`;
            });
            section += '\n';
        }

        // Non-functional requirements
        if (requirements.nonFunctional && Object.keys(requirements.nonFunctional).length > 0) {
            section += '### Non-Functional Requirements\n';
            for (const [type, reqs] of Object.entries(requirements.nonFunctional)) {
                if (reqs && reqs.length > 0) {
                    section += `- **${type.charAt(0).toUpperCase() + type.slice(1)}**: Required\n`;
                }
            }
            section += '\n';
        }

        // Technical requirements
        if (requirements.technical && Object.keys(requirements.technical).length > 0) {
            section += '### Technical Requirements\n';
            for (const [key, value] of Object.entries(requirements.technical)) {
                section += `- **${key}**: ${value}\n`;
            }
            section += '\n';
        }

        return section;
    }

    /**
     * Build context section
     * @param {Object} context - Context information
     * @returns {string} Context section
     * @private
     */
    _buildContextSection(context) {
        let section = '## Context\n\n';

        if (context.summary) {
            section += `${context.summary}\n\n`;
        }

        if (context.fileStructure) {
            section += '### File Structure\n';
            section += '```\n';
            section += context.fileStructure;
            section += '\n```\n\n';
        }

        if (context.relatedFiles && context.relatedFiles.length > 0) {
            section += '### Related Files\n';
            context.relatedFiles.forEach(file => {
                section += `- ${file.path}: ${file.description || 'Related file'}\n`;
            });
            section += '\n';
        }

        if (context.dependencies && context.dependencies.length > 0) {
            section += '### Dependencies\n';
            context.dependencies.forEach(dep => {
                section += `- ${dep.name}: ${dep.version || 'latest'}\n`;
            });
            section += '\n';
        }

        return section;
    }

    /**
     * Build technologies section
     * @param {Object} technologies - Technologies object
     * @returns {string} Technologies section
     * @private
     */
    _buildTechnologiesSection(technologies) {
        let section = '## Technologies\n\n';

        if (technologies.languages && technologies.languages.length > 0) {
            section += '### Programming Languages\n';
            technologies.languages.forEach(lang => {
                section += `- ${lang.name} (confidence: ${(lang.confidence * 100).toFixed(0)}%)\n`;
            });
            section += '\n';
        }

        if (technologies.frameworks && technologies.frameworks.length > 0) {
            section += '### Frameworks\n';
            technologies.frameworks.forEach(framework => {
                section += `- ${framework.name} (confidence: ${(framework.confidence * 100).toFixed(0)}%)\n`;
            });
            section += '\n';
        }

        if (technologies.databases && technologies.databases.length > 0) {
            section += '### Databases\n';
            technologies.databases.forEach(db => {
                section += `- ${db.name}\n`;
            });
            section += '\n';
        }

        return section;
    }

    /**
     * Build quality guidelines section
     * @param {Object} analysis - Task analysis
     * @returns {string} Quality section
     * @private
     */
    _buildQualitySection(analysis) {
        const complexity = analysis.complexity?.level || 'medium';
        const hasSecurityRequirements = analysis.requirements?.nonFunctional?.security;
        
        let section = '## Quality Guidelines\n\n';

        // Base quality requirements
        section += '### Code Quality\n';
        section += '- Write clean, readable, and maintainable code\n';
        section += '- Follow established coding conventions and best practices\n';
        section += '- Include appropriate error handling\n';
        section += '- Add meaningful comments for complex logic\n\n';

        // Testing requirements based on complexity
        section += '### Testing\n';
        if (complexity === 'simple') {
            section += '- Include basic unit tests for core functionality\n';
        } else if (complexity === 'medium') {
            section += '- Include comprehensive unit tests\n';
            section += '- Add integration tests for key workflows\n';
        } else {
            section += '- Include comprehensive unit and integration tests\n';
            section += '- Add end-to-end tests for critical paths\n';
            section += '- Ensure test coverage meets quality standards\n';
        }
        section += '\n';

        // Security requirements
        if (hasSecurityRequirements) {
            section += '### Security\n';
            section += '- Implement proper input validation and sanitization\n';
            section += '- Follow security best practices\n';
            section += '- Ensure secure handling of sensitive data\n';
            section += '- Include security-focused tests\n\n';
        }

        // Documentation requirements
        section += '### Documentation\n';
        section += '- Include clear and concise documentation\n';
        section += '- Document API endpoints and parameters\n';
        section += '- Provide usage examples where appropriate\n';

        return section;
    }

    /**
     * Build examples section
     * @param {Object} analysis - Task analysis
     * @param {Object} template - Template configuration
     * @returns {string} Examples section
     * @private
     */
    _buildExamplesSection(analysis, template) {
        const intent = analysis.intent?.primary || 'create';
        const technologies = analysis.technologies?.languages || [];
        
        let section = '## Examples\n\n';

        // Get relevant examples
        const relevantExamples = this._getRelevantExamples(intent, technologies);
        
        if (relevantExamples.length > 0) {
            relevantExamples.forEach((example, index) => {
                section += `### Example ${index + 1}: ${example.title}\n\n`;
                section += `${example.description}\n\n`;
                section += '```' + (example.language || '') + '\n';
                section += example.code;
                section += '\n```\n\n';
            });
        } else {
            section += 'No specific examples available for this task type.\n\n';
        }

        return section;
    }

    /**
     * Build constraints section
     * @param {Array} constraints - Constraints array
     * @returns {string} Constraints section
     * @private
     */
    _buildConstraintsSection(constraints) {
        let section = '## Constraints\n\n';

        constraints.forEach((constraint, index) => {
            section += `${index + 1}. ${constraint}\n`;
        });

        return section;
    }

    /**
     * Assemble final prompt from sections
     * @param {Object} sections - Prompt sections
     * @param {Object} template - Template configuration
     * @returns {string} Assembled prompt
     * @private
     */
    _assemblePrompt(sections, template) {
        let prompt = '';

        // Add template header if available
        if (template.header) {
            prompt += template.header + '\n\n';
        }

        // Add sections in order
        const sectionOrder = template.sectionOrder || [
            'task', 'requirements', 'context', 'technologies', 'quality', 'examples', 'constraints'
        ];

        for (const sectionName of sectionOrder) {
            if (sections[sectionName]) {
                prompt += sections[sectionName] + '\n';
            }
        }

        // Add template footer if available
        if (template.footer) {
            prompt += '\n' + template.footer;
        }

        return prompt.trim();
    }

    /**
     * Optimize prompt for better results
     * @param {string} prompt - Original prompt
     * @param {Object} analysis - Task analysis
     * @returns {string} Optimized prompt
     * @private
     */
    _optimizePrompt(prompt, analysis) {
        let optimized = prompt;

        // Apply optimization rules
        for (const rule of this.optimizationRules) {
            if (rule.condition(analysis)) {
                optimized = rule.apply(optimized);
            }
        }

        // Ensure prompt doesn't exceed length limit
        if (optimized.length > this.config.maxPromptLength) {
            optimized = this._truncatePrompt(optimized);
        }

        return optimized;
    }

    /**
     * Truncate prompt to fit length limit
     * @param {string} prompt - Prompt to truncate
     * @returns {string} Truncated prompt
     * @private
     */
    _truncatePrompt(prompt) {
        const maxLength = this.config.maxPromptLength - 100; // Leave buffer
        
        if (prompt.length <= maxLength) {
            return prompt;
        }

        // Try to truncate at section boundaries
        const sections = prompt.split('\n## ');
        let truncated = sections[0]; // Keep first section (task description)
        
        for (let i = 1; i < sections.length; i++) {
            const nextSection = '\n## ' + sections[i];
            if (truncated.length + nextSection.length <= maxLength) {
                truncated += nextSection;
            } else {
                break;
            }
        }

        // Add truncation notice
        truncated += '\n\n[Note: Prompt truncated to fit length limit]';
        
        return truncated;
    }

    /**
     * Validate prompt length
     * @param {string} prompt - Prompt to validate
     * @private
     */
    _validatePromptLength(prompt) {
        if (prompt.length > this.config.maxPromptLength) {
            throw new PromptGenerationError(
                `Prompt length (${prompt.length}) exceeds maximum (${this.config.maxPromptLength})`,
                'PROMPT_TOO_LONG'
            );
        }

        if (prompt.length < 50) {
            throw new PromptGenerationError(
                'Prompt is too short to be effective',
                'PROMPT_TOO_SHORT'
            );
        }
    }

    /**
     * Get relevant examples for task
     * @param {string} intent - Task intent
     * @param {Array} technologies - Technologies array
     * @returns {Array} Relevant examples
     * @private
     */
    _getRelevantExamples(intent, technologies) {
        const examples = [];
        
        // Get examples by intent
        if (this.examples[intent]) {
            examples.push(...this.examples[intent]);
        }

        // Get examples by technology
        for (const tech of technologies) {
            if (this.examples[tech.name]) {
                examples.push(...this.examples[tech.name]);
            }
        }

        // Limit to 2-3 most relevant examples
        return examples.slice(0, 3);
    }

    /**
     * Initialize templates
     * @returns {Object} Templates
     * @private
     */
    _initializeTemplates() {
        return {
            default: {
                header: 'You are an expert software developer. Please implement the following task with high quality code.',
                includeRequirements: true,
                includeTechnologies: true,
                includeQuality: true,
                includeExamples: false,
                sectionOrder: ['task', 'requirements', 'context', 'technologies', 'quality'],
                footer: 'Please provide complete, production-ready code with appropriate tests and documentation.',
                instructions: [
                    'Write clean, maintainable code',
                    'Include error handling',
                    'Add appropriate tests',
                    'Follow best practices'
                ],
                constraints: [
                    'Code must be production-ready',
                    'Include comprehensive error handling',
                    'Follow established coding standards'
                ]
            },
            
            create: {
                header: 'You are an expert software developer. Please create the following new functionality.',
                includeRequirements: true,
                includeTechnologies: true,
                includeQuality: true,
                includeExamples: true,
                footer: 'Create complete, well-structured code with tests and documentation.',
                instructions: [
                    'Design clean architecture',
                    'Implement comprehensive functionality',
                    'Include unit and integration tests',
                    'Add clear documentation'
                ]
            },
            
            fix: {
                header: 'You are an expert software developer. Please fix the following issue.',
                includeRequirements: true,
                includeTechnologies: false,
                includeQuality: true,
                includeExamples: false,
                footer: 'Provide a targeted fix with appropriate tests to prevent regression.',
                instructions: [
                    'Identify root cause',
                    'Implement minimal fix',
                    'Add regression tests',
                    'Document the fix'
                ]
            },
            
            refactor: {
                header: 'You are an expert software developer. Please refactor the following code.',
                includeRequirements: true,
                includeTechnologies: true,
                includeQuality: true,
                includeExamples: false,
                footer: 'Improve code quality while maintaining functionality.',
                instructions: [
                    'Preserve existing functionality',
                    'Improve code structure',
                    'Enhance readability',
                    'Maintain test coverage'
                ]
            }
        };
    }

    /**
     * Initialize examples
     * @returns {Object} Examples
     * @private
     */
    _initializeExamples() {
        return {
            create: [
                {
                    title: 'Basic Function Creation',
                    description: 'Example of creating a new function with proper structure',
                    language: 'javascript',
                    code: `function validateEmail(email) {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}`
                }
            ],
            
            javascript: [
                {
                    title: 'JavaScript Module Pattern',
                    description: 'Example of a well-structured JavaScript module',
                    language: 'javascript',
                    code: `export class UserService {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }
  
  async getUser(id) {
    try {
      const response = await this.apiClient.get(\`/users/\${id}\`);
      return response.data;
    } catch (error) {
      throw new Error(\`Failed to fetch user: \${error.message}\`);
    }
  }
}`
                }
            ]
        };
    }

    /**
     * Initialize optimization rules
     * @returns {Array} Optimization rules
     * @private
     */
    _initializeOptimizationRules() {
        return [
            {
                condition: (analysis) => analysis.complexity?.level === 'complex',
                apply: (prompt) => prompt + '\n\nNote: This is a complex task. Please break it down into smaller, manageable components.'
            },
            {
                condition: (analysis) => analysis.requirements?.nonFunctional?.security,
                apply: (prompt) => prompt + '\n\nSecurity Note: This task involves security-sensitive functionality. Please follow security best practices.'
            },
            {
                condition: (analysis) => analysis.priority?.level === 'critical',
                apply: (prompt) => prompt + '\n\nPriority: This is a critical task. Please ensure thorough testing and validation.'
            }
        ];
    }

    /**
     * Compile templates for performance
     * @private
     */
    _compileTemplates() {
        // Pre-process templates if needed
        for (const [name, template] of Object.entries(this.templates)) {
            if (template.header) {
                template.header = template.header.trim();
            }
            if (template.footer) {
                template.footer = template.footer.trim();
            }
        }
    }
}

