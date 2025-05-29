/**
 * @fileoverview Prompt Generator
 * @description Advanced prompt engineering for intelligent code generation
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenError } from './codegen_client.js';

/**
 * Advanced prompt generator for intelligent code generation
 */
export class PromptGenerator {
    constructor(config = {}) {
        this.config = {
            maxPromptLength: config.maxPromptLength || 8000,
            includeContext: config.includeContext !== false,
            includeExamples: config.includeExamples !== false,
            templateVersion: config.templateVersion || '2.0',
            ...config
        };
        
        this.promptTemplates = new PromptTemplateLibrary();
        this.contextBuilder = new ContextBuilder(config);
        this.exampleGenerator = new ExampleGenerator(config);
        
        log('info', 'Prompt generator initialized with advanced templates');
    }

    /**
     * Generate comprehensive prompt for code generation
     * @param {Object} processedTask - Processed task from TaskProcessor
     * @param {Object} projectContext - Project context information
     * @returns {Object} Generated prompt with metadata
     */
    async generateCodePrompt(processedTask, projectContext = {}) {
        try {
            log('debug', `Generating code prompt for task: ${processedTask.id}`);
            
            // Select appropriate template based on task type
            const template = this.promptTemplates.getTemplate(processedTask.parsedRequirements.type);
            
            // Build context information
            const context = await this.contextBuilder.buildContext(processedTask, projectContext);
            
            // Generate examples if needed
            const examples = this.config.includeExamples ? 
                await this.exampleGenerator.generateExamples(processedTask) : [];
            
            // Construct the prompt
            const prompt = await this._constructPrompt(template, processedTask, context, examples);
            
            // Validate prompt length
            if (prompt.content.length > this.config.maxPromptLength) {
                log('warn', `Prompt length ${prompt.content.length} exceeds maximum ${this.config.maxPromptLength}`);
                prompt.content = this._truncatePrompt(prompt.content);
            }
            
            const result = {
                content: prompt.content,
                metadata: {
                    task_id: processedTask.id,
                    template_type: template.type,
                    context_included: this.config.includeContext,
                    examples_included: this.config.includeExamples,
                    prompt_length: prompt.content.length,
                    generated_at: new Date(),
                    version: this.config.templateVersion
                },
                instructions: prompt.instructions,
                constraints: prompt.constraints
            };
            
            log('info', `Generated prompt for task ${processedTask.id} (${result.metadata.prompt_length} chars)`);
            return result;
            
        } catch (error) {
            log('error', `Failed to generate prompt for task ${processedTask.id}: ${error.message}`);
            throw new CodegenError(`Prompt generation failed: ${error.message}`, 'PROMPT_GENERATION_ERROR');
        }
    }

    /**
     * Generate PR description prompt
     * @param {Object} processedTask - Processed task
     * @param {Object} codeChanges - Information about code changes
     * @returns {Object} PR description prompt
     */
    async generatePRPrompt(processedTask, codeChanges = {}) {
        try {
            const template = this.promptTemplates.getPRTemplate();
            
            const prPrompt = {
                title: this._generatePRTitle(processedTask),
                description: this._generatePRDescription(processedTask, codeChanges),
                labels: this._generatePRLabels(processedTask),
                reviewers: this._suggestReviewers(processedTask),
                metadata: {
                    task_id: processedTask.id,
                    generated_at: new Date(),
                    template_version: this.config.templateVersion
                }
            };
            
            log('info', `Generated PR prompt for task ${processedTask.id}`);
            return prPrompt;
            
        } catch (error) {
            log('error', `Failed to generate PR prompt: ${error.message}`);
            throw new CodegenError(`PR prompt generation failed: ${error.message}`, 'PR_PROMPT_ERROR');
        }
    }

    /**
     * Construct the main prompt from template and components
     * @param {Object} template - Prompt template
     * @param {Object} task - Processed task
     * @param {Object} context - Context information
     * @param {Array} examples - Code examples
     * @returns {Object} Constructed prompt
     * @private
     */
    async _constructPrompt(template, task, context, examples) {
        const sections = [];
        
        // Header section
        sections.push(this._buildHeaderSection(task));
        
        // Requirements section
        sections.push(this._buildRequirementsSection(task));
        
        // Context section
        if (this.config.includeContext && context) {
            sections.push(this._buildContextSection(context));
        }
        
        // Technical specifications
        sections.push(this._buildTechnicalSection(task));
        
        // Examples section
        if (examples.length > 0) {
            sections.push(this._buildExamplesSection(examples));
        }
        
        // Constraints and guidelines
        sections.push(this._buildConstraintsSection(task));
        
        // Instructions section
        sections.push(this._buildInstructionsSection(task, template));
        
        return {
            content: sections.join('\n\n'),
            instructions: template.instructions,
            constraints: this._extractConstraints(task)
        };
    }

    /**
     * Build header section
     * @param {Object} task
     * @returns {string}
     * @private
     */
    _buildHeaderSection(task) {
        return `# Code Generation Task: ${task.id}

## Task Overview
**Type**: ${task.parsedRequirements.type}
**Priority**: ${task.priority}/10
**Complexity**: ${task.complexity}/10
**Estimated Effort**: ${task.estimatedEffort} hours

## Original Requirements
${task.originalDescription}`;
    }

    /**
     * Build requirements section
     * @param {Object} task
     * @returns {string}
     * @private
     */
    _buildRequirementsSection(task) {
        const req = task.parsedRequirements;
        
        let section = `## Parsed Requirements

### Actions Required
${req.actions.map(action => `- ${action}`).join('\n')}

### Entities Involved
${req.entities.map(entity => `- **${entity.type}**: ${entity.value}`).join('\n')}`;

        if (req.acceptance_criteria.length > 0) {
            section += `\n\n### Acceptance Criteria
${req.acceptance_criteria.map(criteria => `- ${criteria.description}`).join('\n')}`;
        }

        return section;
    }

    /**
     * Build context section
     * @param {Object} context
     * @returns {string}
     * @private
     */
    _buildContextSection(context) {
        return `## Project Context

**Project Type**: ${context.project_type}
**Domain**: ${context.domain}
**Estimated Files Affected**: ${context.estimated_files}

### Related Components
${context.related_components.map(comp => `- ${comp}`).join('\n')}

### Complexity Indicators
${context.complexity_indicators.map(indicator => `- ${indicator}`).join('\n')}

### Risk Factors
${context.risk_factors.map(risk => `- **${risk.type}** (${risk.level}): ${risk.description}`).join('\n')}`;
    }

    /**
     * Build technical section
     * @param {Object} task
     * @returns {string}
     * @private
     */
    _buildTechnicalSection(task) {
        const techReqs = task.parsedRequirements.technical_requirements;
        
        if (techReqs.length === 0) {
            return `## Technical Requirements
No specific technical requirements identified.`;
        }
        
        return `## Technical Requirements
${techReqs.map(req => `- **${req.technology}**: ${req.description}`).join('\n')}

### Dependencies
${task.dependencies.map(dep => `- **${dep.type}**: ${dep.description}`).join('\n')}`;
    }

    /**
     * Build examples section
     * @param {Array} examples
     * @returns {string}
     * @private
     */
    _buildExamplesSection(examples) {
        if (examples.length === 0) return '';
        
        return `## Code Examples

${examples.map(example => `### ${example.title}
\`\`\`${example.language}
${example.code}
\`\`\`
${example.explanation ? `\n${example.explanation}` : ''}`).join('\n\n')}`;
    }

    /**
     * Build constraints section
     * @param {Object} task
     * @returns {string}
     * @private
     */
    _buildConstraintsSection(task) {
        const constraints = task.parsedRequirements.constraints;
        
        let section = `## Constraints and Guidelines

### Code Quality Requirements
- Follow established coding standards and best practices
- Include comprehensive error handling
- Add appropriate logging and monitoring
- Ensure code is maintainable and well-documented
- Write unit tests for new functionality`;

        if (constraints.length > 0) {
            section += `\n\n### Specific Constraints
${constraints.map(constraint => `- **${constraint.type}**: ${constraint.description}`).join('\n')}`;
        }

        return section;
    }

    /**
     * Build instructions section
     * @param {Object} task
     * @param {Object} template
     * @returns {string}
     * @private
     */
    _buildInstructionsSection(task, template) {
        return `## Implementation Instructions

${template.instructions}

### File Organization
- Create new files in appropriate directories
- Follow existing project structure
- Update imports and exports as needed
- Maintain consistent naming conventions

### Testing Requirements
- Write unit tests for new functions/methods
- Include integration tests if applicable
- Ensure all tests pass before submission
- Aim for high test coverage

### Documentation Requirements
- Add JSDoc comments for functions and classes
- Update README if new features are added
- Include inline comments for complex logic
- Document any configuration changes

### Submission Guidelines
- Create a descriptive commit message
- Include all modified and new files
- Ensure code passes linting and formatting checks
- Provide clear PR description with implementation details`;
    }

    /**
     * Generate PR title
     * @param {Object} task
     * @returns {string}
     * @private
     */
    _generatePRTitle(task) {
        const type = task.parsedRequirements.type;
        const actions = task.parsedRequirements.actions.slice(0, 2).join(', ');
        
        const typePrefix = {
            'feature': 'feat:',
            'bug_fix': 'fix:',
            'refactor': 'refactor:',
            'test': 'test:',
            'documentation': 'docs:',
            'configuration': 'config:',
            'integration': 'feat:'
        }[type] || 'chore:';
        
        return `${typePrefix} ${actions} - Task ${task.id}`;
    }

    /**
     * Generate PR description
     * @param {Object} task
     * @param {Object} codeChanges
     * @returns {string}
     * @private
     */
    _generatePRDescription(task, codeChanges) {
        return `## Task Summary
${task.originalDescription}

## Implementation Details
**Task ID**: ${task.id}
**Type**: ${task.parsedRequirements.type}
**Complexity**: ${task.complexity}/10
**Priority**: ${task.priority}/10

### Changes Made
${task.parsedRequirements.actions.map(action => `- ${action}`).join('\n')}

### Files Modified
${codeChanges.files ? codeChanges.files.map(file => `- \`${file}\``).join('\n') : 'Files will be listed after implementation'}

### Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests passing
- [ ] Code coverage maintained

### Acceptance Criteria
${task.parsedRequirements.acceptance_criteria.map(criteria => `- [ ] ${criteria.description}`).join('\n')}

### Additional Notes
${task.dependencies.length > 0 ? `**Dependencies**: ${task.dependencies.map(dep => dep.description).join(', ')}` : ''}
${task.context.risk_factors.length > 0 ? `\n**Risk Factors**: ${task.context.risk_factors.map(risk => risk.description).join(', ')}` : ''}

---
*Generated by Codegen AI System v${this.config.templateVersion}*`;
    }

    /**
     * Generate PR labels
     * @param {Object} task
     * @returns {Array}
     * @private
     */
    _generatePRLabels(task) {
        const labels = [];
        
        // Type-based labels
        const typeLabels = {
            'feature': 'enhancement',
            'bug_fix': 'bug',
            'refactor': 'refactoring',
            'test': 'testing',
            'documentation': 'documentation',
            'configuration': 'configuration',
            'integration': 'integration'
        };
        
        if (typeLabels[task.parsedRequirements.type]) {
            labels.push(typeLabels[task.parsedRequirements.type]);
        }
        
        // Priority labels
        if (task.priority >= 8) labels.push('high-priority');
        else if (task.priority >= 6) labels.push('medium-priority');
        else labels.push('low-priority');
        
        // Complexity labels
        if (task.complexity >= 8) labels.push('complex');
        else if (task.complexity >= 5) labels.push('moderate');
        else labels.push('simple');
        
        // Technology labels
        task.parsedRequirements.technical_requirements.forEach(req => {
            labels.push(req.technology);
        });
        
        // Risk labels
        if (task.context.risk_factors.some(risk => risk.level === 'high')) {
            labels.push('high-risk');
        }
        
        labels.push('codegen-generated');
        
        return labels;
    }

    /**
     * Suggest reviewers based on task
     * @param {Object} task
     * @returns {Array}
     * @private
     */
    _suggestReviewers(task) {
        const reviewers = [];
        
        // Suggest reviewers based on technology
        const techReviewers = {
            'react': ['frontend-team'],
            'vue': ['frontend-team'],
            'angular': ['frontend-team'],
            'node': ['backend-team'],
            'python': ['backend-team'],
            'database': ['database-team'],
            'api': ['api-team']
        };
        
        task.parsedRequirements.technical_requirements.forEach(req => {
            if (techReviewers[req.technology]) {
                reviewers.push(...techReviewers[req.technology]);
            }
        });
        
        // Add security reviewer for security-sensitive tasks
        if (task.parsedRequirements.constraints.some(c => c.type === 'security')) {
            reviewers.push('security-team');
        }
        
        // Add senior reviewer for complex tasks
        if (task.complexity >= 8) {
            reviewers.push('senior-developer');
        }
        
        return [...new Set(reviewers)]; // Remove duplicates
    }

    /**
     * Extract constraints for prompt
     * @param {Object} task
     * @returns {Array}
     * @private
     */
    _extractConstraints(task) {
        return task.parsedRequirements.constraints.map(constraint => ({
            type: constraint.type,
            description: constraint.description,
            priority: this._getConstraintPriority(constraint.type)
        }));
    }

    /**
     * Get constraint priority
     * @param {string} type
     * @returns {string}
     * @private
     */
    _getConstraintPriority(type) {
        const priorities = {
            'security': 'high',
            'performance': 'high',
            'compatibility': 'medium',
            'testing': 'medium'
        };
        
        return priorities[type] || 'low';
    }

    /**
     * Truncate prompt if too long
     * @param {string} content
     * @returns {string}
     * @private
     */
    _truncatePrompt(content) {
        const maxLength = this.config.maxPromptLength;
        if (content.length <= maxLength) return content;
        
        // Try to truncate at section boundaries
        const sections = content.split('\n\n');
        let truncated = '';
        
        for (const section of sections) {
            if (truncated.length + section.length + 2 <= maxLength) {
                truncated += (truncated ? '\n\n' : '') + section;
            } else {
                break;
            }
        }
        
        // If still too long, hard truncate
        if (truncated.length > maxLength) {
            truncated = truncated.substring(0, maxLength - 100) + '\n\n[Content truncated due to length limits]';
        }
        
        return truncated;
    }
}

/**
 * Prompt template library
 */
class PromptTemplateLibrary {
    constructor() {
        this.templates = this._initializeTemplates();
    }

    /**
     * Get template by type
     * @param {string} type
     * @returns {Object}
     */
    getTemplate(type) {
        return this.templates[type] || this.templates.default;
    }

    /**
     * Get PR template
     * @returns {Object}
     */
    getPRTemplate() {
        return this.templates.pr;
    }

    /**
     * Initialize templates
     * @returns {Object}
     * @private
     */
    _initializeTemplates() {
        return {
            feature: {
                type: 'feature',
                instructions: `You are tasked with implementing a new feature. Focus on:
1. Creating clean, maintainable code that follows best practices
2. Implementing all required functionality as specified
3. Adding comprehensive error handling and validation
4. Writing unit tests for new functionality
5. Updating documentation as needed
6. Ensuring the feature integrates well with existing code`
            },
            
            bug_fix: {
                type: 'bug_fix',
                instructions: `You are tasked with fixing a bug. Focus on:
1. Identifying the root cause of the issue
2. Implementing a targeted fix that doesn't break existing functionality
3. Adding tests to prevent regression
4. Documenting the fix and any side effects
5. Ensuring the fix is minimal and focused
6. Validating the fix resolves the reported issue`
            },
            
            refactor: {
                type: 'refactor',
                instructions: `You are tasked with refactoring existing code. Focus on:
1. Improving code structure and readability
2. Maintaining existing functionality (no behavior changes)
3. Optimizing performance where applicable
4. Reducing code duplication
5. Improving maintainability
6. Ensuring all tests continue to pass`
            },
            
            test: {
                type: 'test',
                instructions: `You are tasked with adding or improving tests. Focus on:
1. Writing comprehensive test cases that cover edge cases
2. Ensuring good test coverage for the target functionality
3. Using appropriate testing patterns and best practices
4. Making tests readable and maintainable
5. Including both positive and negative test cases
6. Ensuring tests are fast and reliable`
            },
            
            documentation: {
                type: 'documentation',
                instructions: `You are tasked with creating or updating documentation. Focus on:
1. Writing clear, concise, and accurate documentation
2. Including practical examples and use cases
3. Organizing information logically
4. Using proper formatting and structure
5. Ensuring documentation is up-to-date with current code
6. Making documentation accessible to the target audience`
            },
            
            configuration: {
                type: 'configuration',
                instructions: `You are tasked with configuration changes. Focus on:
1. Making configuration changes that are safe and reversible
2. Documenting all configuration options and their effects
3. Ensuring backward compatibility where possible
4. Validating configuration values
5. Providing clear migration instructions if needed
6. Testing configuration changes thoroughly`
            },
            
            integration: {
                type: 'integration',
                instructions: `You are tasked with integrating systems or components. Focus on:
1. Creating robust integration points with proper error handling
2. Implementing appropriate authentication and authorization
3. Adding comprehensive logging and monitoring
4. Ensuring data consistency and integrity
5. Handling network failures and timeouts gracefully
6. Documenting integration patterns and dependencies`
            },
            
            default: {
                type: 'default',
                instructions: `You are tasked with implementing a code change. Focus on:
1. Understanding the requirements thoroughly
2. Writing clean, maintainable, and well-documented code
3. Following established coding standards and best practices
4. Adding appropriate tests and error handling
5. Ensuring the implementation is robust and scalable
6. Documenting your changes and any assumptions made`
            },
            
            pr: {
                type: 'pr',
                instructions: 'Generate a comprehensive PR description with implementation details, testing information, and clear acceptance criteria.'
            }
        };
    }
}

/**
 * Context builder for enhanced prompts
 */
class ContextBuilder {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Build context information
     * @param {Object} task
     * @param {Object} projectContext
     * @returns {Object}
     */
    async buildContext(task, projectContext) {
        return {
            project_type: projectContext.type || task.context.project_type,
            domain: projectContext.domain || task.context.domain,
            estimated_files: task.context.estimated_files,
            related_components: task.context.related_components,
            complexity_indicators: task.context.complexity_indicators,
            risk_factors: task.context.risk_factors,
            existing_patterns: projectContext.patterns || [],
            coding_standards: projectContext.standards || [],
            architecture_notes: projectContext.architecture || ''
        };
    }
}

/**
 * Example generator for code prompts
 */
class ExampleGenerator {
    constructor(config = {}) {
        this.config = config;
        this.examples = this._initializeExamples();
    }

    /**
     * Generate examples for task
     * @param {Object} task
     * @returns {Array}
     */
    async generateExamples(task) {
        const examples = [];
        const taskType = task.parsedRequirements.type;
        const techRequirements = task.parsedRequirements.technical_requirements;
        
        // Add type-specific examples
        if (this.examples[taskType]) {
            examples.push(...this.examples[taskType]);
        }
        
        // Add technology-specific examples
        techRequirements.forEach(req => {
            if (this.examples.tech && this.examples.tech[req.technology]) {
                examples.push(...this.examples.tech[req.technology]);
            }
        });
        
        return examples.slice(0, 3); // Limit to 3 examples
    }

    /**
     * Initialize example library
     * @returns {Object}
     * @private
     */
    _initializeExamples() {
        return {
            feature: [
                {
                    title: 'Feature Implementation Pattern',
                    language: 'javascript',
                    code: `// Example feature implementation
export class FeatureService {
    constructor(dependencies) {
        this.validate(dependencies);
        this.dependencies = dependencies;
    }
    
    async implementFeature(params) {
        try {
            this.validateParams(params);
            const result = await this.processFeature(params);
            this.logSuccess(result);
            return result;
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    
    validate(dependencies) {
        if (!dependencies) {
            throw new Error('Dependencies required');
        }
    }
}`,
                    explanation: 'Standard pattern for implementing new features with validation and error handling'
                }
            ],
            
            bug_fix: [
                {
                    title: 'Bug Fix Pattern',
                    language: 'javascript',
                    code: `// Before: Problematic code
function processData(data) {
    return data.map(item => item.value); // Fails if item is null
}

// After: Fixed code with proper validation
function processData(data) {
    if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
    }
    
    return data
        .filter(item => item && typeof item === 'object')
        .map(item => item.value)
        .filter(value => value !== undefined);
}`,
                    explanation: 'Example of fixing a null reference bug with proper validation'
                }
            ],
            
            tech: {
                react: [
                    {
                        title: 'React Component Pattern',
                        language: 'jsx',
                        code: `import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const ExampleComponent = ({ initialData, onUpdate }) => {
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    
    useEffect(() => {
        if (initialData) {
            setData(initialData);
        }
    }, [initialData]);
    
    const handleUpdate = async (newData) => {
        setLoading(true);
        setError(null);
        
        try {
            await onUpdate(newData);
            setData(newData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    if (error) {
        return <div className="error">Error: {error}</div>;
    }
    
    return (
        <div className="example-component">
            {loading && <div className="loading">Loading...</div>}
            {/* Component content */}
        </div>
    );
};

ExampleComponent.propTypes = {
    initialData: PropTypes.object,
    onUpdate: PropTypes.func.isRequired
};

export default ExampleComponent;`,
                        explanation: 'Standard React component with hooks, error handling, and PropTypes'
                    }
                ],
                
                node: [
                    {
                        title: 'Node.js Service Pattern',
                        language: 'javascript',
                        code: `import { EventEmitter } from 'events';
import { logger } from './logger.js';

export class ExampleService extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.isInitialized = false;
    }
    
    async initialize() {
        try {
            await this.setupConnections();
            this.isInitialized = true;
            this.emit('initialized');
            logger.info('Service initialized successfully');
        } catch (error) {
            logger.error('Service initialization failed:', error);
            throw error;
        }
    }
    
    async processRequest(request) {
        if (!this.isInitialized) {
            throw new Error('Service not initialized');
        }
        
        const startTime = Date.now();
        
        try {
            const result = await this.handleRequest(request);
            const duration = Date.now() - startTime;
            
            logger.info('Request processed', { duration, requestId: request.id });
            return result;
        } catch (error) {
            logger.error('Request processing failed:', error);
            throw error;
        }
    }
    
    async shutdown() {
        this.emit('shutdown');
        await this.closeConnections();
        this.isInitialized = false;
    }
}`,
                        explanation: 'Node.js service pattern with proper initialization, logging, and lifecycle management'
                    }
                ]
            }
        };
    }
}

export default PromptGenerator;

