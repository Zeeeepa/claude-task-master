/**
 * @fileoverview Codegen Prompt Generator
 * @description Converts database tasks to optimized Codegen prompts with context injection
 */

import { EventEmitter } from 'events';

/**
 * Prompt Generator for Codegen Integration
 * Transforms database tasks into structured, context-aware prompts
 */
export class PromptGenerator extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            templates: {
                feature: config.templates?.feature || 'feature_template',
                bugfix: config.templates?.bugfix || 'bugfix_template',
                refactor: config.templates?.refactor || 'refactor_template',
                documentation: config.templates?.documentation || 'docs_template',
                test: config.templates?.test || 'test_template',
                default: config.templates?.default || 'default_template'
            },
            codeStyle: {
                language: config.codeStyle?.language || 'javascript',
                framework: config.codeStyle?.framework || 'node',
                testFramework: config.codeStyle?.testFramework || 'jest',
                linting: config.codeStyle?.linting || 'eslint',
                formatting: config.codeStyle?.formatting || 'prettier'
            },
            context: {
                includeFileStructure: config.context?.includeFileStructure !== false,
                includeRelatedFiles: config.context?.includeRelatedFiles !== false,
                includeDependencies: config.context?.includeDependencies !== false,
                maxContextLength: config.context?.maxContextLength || 8000
            },
            quality: {
                requireTests: config.quality?.requireTests !== false,
                requireDocumentation: config.quality?.requireDocumentation !== false,
                requireTypeChecking: config.quality?.requireTypeChecking || false,
                requireErrorHandling: config.quality?.requireErrorHandling !== false
            },
            ...config
        };

        this.templates = new Map();
        this.contextCache = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the prompt generator
     */
    async initialize() {
        try {
            console.log('🤖 Initializing Codegen prompt generator...');
            
            this._loadTemplates();
            this._setupContextCache();
            
            this.isInitialized = true;
            console.log('✅ Prompt generator initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize prompt generator:', error);
            throw error;
        }
    }

    /**
     * Generate a Codegen prompt from a database task
     * @param {Object} task - Task object from database
     * @returns {Promise<Object>} Generated prompt with metadata
     */
    async generatePrompt(task) {
        if (!this.isInitialized) {
            throw new Error('Prompt generator not initialized');
        }

        try {
            console.log(`🔄 Generating prompt for task: ${task.id}`);

            // Determine task type and select appropriate template
            const taskType = this._determineTaskType(task);
            const template = this._getTemplate(taskType);

            // Extract and structure task information
            const taskInfo = this._extractTaskInfo(task);

            // Generate context information
            const context = await this._generateContext(task);

            // Build the prompt
            const prompt = this._buildPrompt(template, taskInfo, context);

            // Add quality requirements
            const qualityRequirements = this._generateQualityRequirements(taskType);

            // Create final prompt object
            const result = {
                content: prompt,
                metadata: {
                    taskId: task.id,
                    taskType,
                    template: template.name,
                    context: {
                        filesIncluded: context.files?.length || 0,
                        dependenciesIncluded: context.dependencies?.length || 0,
                        contextLength: prompt.length
                    },
                    quality: qualityRequirements,
                    generatedAt: new Date().toISOString()
                }
            };

            this.emit('prompt_generated', {
                taskId: task.id,
                promptLength: prompt.length,
                taskType
            });

            console.log(`✅ Generated prompt for task ${task.id} (${prompt.length} chars)`);
            return result;

        } catch (error) {
            console.error(`❌ Failed to generate prompt for task ${task.id}:`, error);
            this.emit('prompt_error', { taskId: task.id, error: error.message });
            throw error;
        }
    }

    /**
     * Determine task type from task data
     * @param {Object} task - Task object
     * @returns {string} Task type
     * @private
     */
    _determineTaskType(task) {
        const title = (task.title || '').toLowerCase();
        const description = (task.description || '').toLowerCase();
        const labels = task.labels || [];

        // Check labels first
        for (const label of labels) {
            const labelLower = label.toLowerCase();
            if (['bug', 'bugfix', 'fix'].includes(labelLower)) return 'bugfix';
            if (['feature', 'enhancement', 'new'].includes(labelLower)) return 'feature';
            if (['refactor', 'cleanup', 'optimization'].includes(labelLower)) return 'refactor';
            if (['docs', 'documentation'].includes(labelLower)) return 'documentation';
            if (['test', 'testing', 'spec'].includes(labelLower)) return 'test';
        }

        // Check title and description
        const text = `${title} ${description}`;
        
        if (/\b(bug|fix|error|issue|problem)\b/i.test(text)) return 'bugfix';
        if (/\b(feature|add|implement|create|new)\b/i.test(text)) return 'feature';
        if (/\b(refactor|cleanup|optimize|improve)\b/i.test(text)) return 'refactor';
        if (/\b(document|docs|readme|guide)\b/i.test(text)) return 'documentation';
        if (/\b(test|spec|testing|coverage)\b/i.test(text)) return 'test';

        return 'default';
    }

    /**
     * Get template for task type
     * @param {string} taskType - Task type
     * @returns {Object} Template object
     * @private
     */
    _getTemplate(taskType) {
        return this.templates.get(taskType) || this.templates.get('default');
    }

    /**
     * Extract structured information from task
     * @param {Object} task - Task object
     * @returns {Object} Structured task information
     * @private
     */
    _extractTaskInfo(task) {
        return {
            id: task.id,
            title: task.title || 'Untitled Task',
            description: task.description || '',
            priority: task.priority || 'medium',
            labels: task.labels || [],
            assignee: task.assignee || null,
            repository: task.repository || this._getDefaultRepository(),
            branch: task.branch || null,
            files: task.files || [],
            dependencies: task.dependencies || [],
            acceptance_criteria: task.acceptance_criteria || [],
            technical_requirements: task.technical_requirements || [],
            created_at: task.created_at,
            updated_at: task.updated_at
        };
    }

    /**
     * Generate context information for the task
     * @param {Object} task - Task object
     * @returns {Promise<Object>} Context information
     * @private
     */
    async _generateContext(task) {
        const context = {
            repository: this._getRepositoryContext(task),
            files: [],
            dependencies: [],
            codeStyle: this.config.codeStyle,
            projectStructure: null
        };

        // Add file structure if enabled
        if (this.config.context.includeFileStructure) {
            context.projectStructure = await this._getProjectStructure(task);
        }

        // Add related files if enabled
        if (this.config.context.includeRelatedFiles) {
            context.files = await this._getRelatedFiles(task);
        }

        // Add dependencies if enabled
        if (this.config.context.includeDependencies) {
            context.dependencies = await this._getProjectDependencies(task);
        }

        return context;
    }

    /**
     * Build the final prompt from template and data
     * @param {Object} template - Template object
     * @param {Object} taskInfo - Task information
     * @param {Object} context - Context information
     * @returns {string} Generated prompt
     * @private
     */
    _buildPrompt(template, taskInfo, context) {
        let prompt = template.content;

        // Replace template variables
        const variables = {
            TASK_TITLE: taskInfo.title,
            TASK_DESCRIPTION: taskInfo.description,
            TASK_ID: taskInfo.id,
            TASK_PRIORITY: taskInfo.priority,
            TASK_LABELS: taskInfo.labels.join(', '),
            REPOSITORY: taskInfo.repository,
            BRANCH: taskInfo.branch || 'main',
            CODE_LANGUAGE: context.codeStyle.language,
            FRAMEWORK: context.codeStyle.framework,
            TEST_FRAMEWORK: context.codeStyle.testFramework,
            ACCEPTANCE_CRITERIA: this._formatAcceptanceCriteria(taskInfo.acceptance_criteria),
            TECHNICAL_REQUIREMENTS: this._formatTechnicalRequirements(taskInfo.technical_requirements),
            PROJECT_STRUCTURE: this._formatProjectStructure(context.projectStructure),
            RELATED_FILES: this._formatRelatedFiles(context.files),
            DEPENDENCIES: this._formatDependencies(context.dependencies),
            TIMESTAMP: new Date().toISOString()
        };

        // Replace all variables in the prompt
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            prompt = prompt.replace(regex, value || '');
        }

        // Add code style guidelines
        prompt += this._generateCodeStyleSection(context.codeStyle);

        // Ensure prompt doesn't exceed max length
        if (prompt.length > this.config.context.maxContextLength) {
            prompt = this._truncatePrompt(prompt, this.config.context.maxContextLength);
        }

        return prompt;
    }

    /**
     * Generate quality requirements section
     * @param {string} taskType - Task type
     * @returns {Object} Quality requirements
     * @private
     */
    _generateQualityRequirements(taskType) {
        const requirements = {
            tests: this.config.quality.requireTests,
            documentation: this.config.quality.requireDocumentation,
            typeChecking: this.config.quality.requireTypeChecking,
            errorHandling: this.config.quality.requireErrorHandling,
            codeReview: true,
            linting: true
        };

        // Adjust requirements based on task type
        switch (taskType) {
            case 'test':
                requirements.tests = true;
                break;
            case 'documentation':
                requirements.documentation = true;
                requirements.tests = false;
                break;
            case 'bugfix':
                requirements.errorHandling = true;
                requirements.tests = true;
                break;
        }

        return requirements;
    }

    /**
     * Load prompt templates
     * @private
     */
    _loadTemplates() {
        // Feature template
        this.templates.set('feature', {
            name: 'feature_template',
            content: `# Feature Implementation Task

## Task Details
- **ID**: {{TASK_ID}}
- **Title**: {{TASK_TITLE}}
- **Priority**: {{TASK_PRIORITY}}
- **Repository**: {{REPOSITORY}}
- **Target Branch**: {{BRANCH}}

## Description
{{TASK_DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Requirements
{{TECHNICAL_REQUIREMENTS}}

## Implementation Guidelines
1. Create clean, maintainable {{CODE_LANGUAGE}} code using {{FRAMEWORK}}
2. Follow existing project patterns and conventions
3. Implement comprehensive error handling
4. Add appropriate logging and monitoring
5. Ensure backward compatibility

## Testing Requirements
- Write unit tests using {{TEST_FRAMEWORK}}
- Achieve minimum 80% code coverage
- Include integration tests where applicable
- Test edge cases and error scenarios

## Project Context
{{PROJECT_STRUCTURE}}

## Related Files
{{RELATED_FILES}}

## Dependencies
{{DEPENDENCIES}}

Please implement this feature following best practices and the project's coding standards.`
        });

        // Bugfix template
        this.templates.set('bugfix', {
            name: 'bugfix_template',
            content: `# Bug Fix Task

## Task Details
- **ID**: {{TASK_ID}}
- **Title**: {{TASK_TITLE}}
- **Priority**: {{TASK_PRIORITY}}
- **Repository**: {{REPOSITORY}}
- **Target Branch**: {{BRANCH}}

## Bug Description
{{TASK_DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Requirements
{{TECHNICAL_REQUIREMENTS}}

## Fix Guidelines
1. Identify root cause of the issue
2. Implement minimal, targeted fix
3. Ensure fix doesn't introduce regressions
4. Add tests to prevent future occurrences
5. Update documentation if necessary

## Testing Requirements
- Write regression tests for the bug
- Verify existing tests still pass
- Test fix in multiple scenarios
- Include edge case testing

## Project Context
{{PROJECT_STRUCTURE}}

## Related Files
{{RELATED_FILES}}

## Dependencies
{{DEPENDENCIES}}

Please fix this bug with a focused, well-tested solution.`
        });

        // Refactor template
        this.templates.set('refactor', {
            name: 'refactor_template',
            content: `# Code Refactoring Task

## Task Details
- **ID**: {{TASK_ID}}
- **Title**: {{TASK_TITLE}}
- **Priority**: {{TASK_PRIORITY}}
- **Repository**: {{REPOSITORY}}
- **Target Branch**: {{BRANCH}}

## Refactoring Description
{{TASK_DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Requirements
{{TECHNICAL_REQUIREMENTS}}

## Refactoring Guidelines
1. Maintain existing functionality
2. Improve code readability and maintainability
3. Reduce code duplication
4. Optimize performance where possible
5. Update documentation and comments

## Testing Requirements
- Ensure all existing tests pass
- Add tests for any new abstractions
- Verify performance improvements
- Test refactored code thoroughly

## Project Context
{{PROJECT_STRUCTURE}}

## Related Files
{{RELATED_FILES}}

## Dependencies
{{DEPENDENCIES}}

Please refactor this code while maintaining all existing functionality.`
        });

        // Documentation template
        this.templates.set('documentation', {
            name: 'docs_template',
            content: `# Documentation Task

## Task Details
- **ID**: {{TASK_ID}}
- **Title**: {{TASK_TITLE}}
- **Priority**: {{TASK_PRIORITY}}
- **Repository**: {{REPOSITORY}}
- **Target Branch**: {{BRANCH}}

## Documentation Requirements
{{TASK_DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Requirements
{{TECHNICAL_REQUIREMENTS}}

## Documentation Guidelines
1. Write clear, concise documentation
2. Include code examples where appropriate
3. Use consistent formatting and style
4. Ensure accuracy and completeness
5. Make it accessible to target audience

## Content Requirements
- API documentation with examples
- Setup and installation instructions
- Usage guidelines and best practices
- Troubleshooting section
- Contributing guidelines

## Project Context
{{PROJECT_STRUCTURE}}

## Related Files
{{RELATED_FILES}}

## Dependencies
{{DEPENDENCIES}}

Please create comprehensive, user-friendly documentation.`
        });

        // Test template
        this.templates.set('test', {
            name: 'test_template',
            content: `# Testing Task

## Task Details
- **ID**: {{TASK_ID}}
- **Title**: {{TASK_TITLE}}
- **Priority**: {{TASK_PRIORITY}}
- **Repository**: {{REPOSITORY}}
- **Target Branch**: {{BRANCH}}

## Testing Requirements
{{TASK_DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Requirements
{{TECHNICAL_REQUIREMENTS}}

## Testing Guidelines
1. Write comprehensive test suites using {{TEST_FRAMEWORK}}
2. Cover all code paths and edge cases
3. Include unit, integration, and e2e tests
4. Ensure tests are maintainable and readable
5. Achieve high code coverage

## Test Types Required
- Unit tests for individual functions
- Integration tests for component interactions
- End-to-end tests for user workflows
- Performance tests where applicable
- Security tests for sensitive operations

## Project Context
{{PROJECT_STRUCTURE}}

## Related Files
{{RELATED_FILES}}

## Dependencies
{{DEPENDENCIES}}

Please create a comprehensive test suite with excellent coverage.`
        });

        // Default template
        this.templates.set('default', {
            name: 'default_template',
            content: `# Development Task

## Task Details
- **ID**: {{TASK_ID}}
- **Title**: {{TASK_TITLE}}
- **Priority**: {{TASK_PRIORITY}}
- **Repository**: {{REPOSITORY}}
- **Target Branch**: {{BRANCH}}

## Description
{{TASK_DESCRIPTION}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Requirements
{{TECHNICAL_REQUIREMENTS}}

## Implementation Guidelines
1. Follow project coding standards
2. Write clean, maintainable code
3. Include appropriate tests
4. Add necessary documentation
5. Ensure code quality and performance

## Project Context
{{PROJECT_STRUCTURE}}

## Related Files
{{RELATED_FILES}}

## Dependencies
{{DEPENDENCIES}}

Please implement this task following best practices.`
        });
    }

    /**
     * Setup context cache
     * @private
     */
    _setupContextCache() {
        // Cache for frequently accessed context data
        this.contextCache.set('project_structure', null);
        this.contextCache.set('dependencies', null);
        this.contextCache.set('file_patterns', new Map());
    }

    /**
     * Get repository context
     * @param {Object} task - Task object
     * @returns {Object} Repository context
     * @private
     */
    _getRepositoryContext(task) {
        return {
            name: task.repository || 'claude-task-master',
            owner: 'Zeeeepa',
            branch: task.branch || 'main',
            language: this.config.codeStyle.language,
            framework: this.config.codeStyle.framework
        };
    }

    /**
     * Get default repository
     * @returns {string} Default repository name
     * @private
     */
    _getDefaultRepository() {
        return 'Zeeeepa/claude-task-master';
    }

    /**
     * Get project structure (mock implementation)
     * @param {Object} task - Task object
     * @returns {Promise<string>} Project structure
     * @private
     */
    async _getProjectStructure(task) {
        // In a real implementation, this would analyze the actual project structure
        return `
src/
├── integrations/
│   ├── codegen/
│   ├── claude-code/
│   └── agent-api/
├── ai_cicd_system/
│   ├── core/
│   ├── config/
│   └── database/
└── utils/
`;
    }

    /**
     * Get related files (mock implementation)
     * @param {Object} task - Task object
     * @returns {Promise<Array>} Related files
     * @private
     */
    async _getRelatedFiles(task) {
        // In a real implementation, this would analyze file relationships
        return task.files || [];
    }

    /**
     * Get project dependencies (mock implementation)
     * @param {Object} task - Task object
     * @returns {Promise<Array>} Project dependencies
     * @private
     */
    async _getProjectDependencies(task) {
        // In a real implementation, this would read package.json or similar
        return [
            'express',
            'axios',
            'lodash',
            'jest',
            'eslint',
            'prettier'
        ];
    }

    /**
     * Format acceptance criteria
     * @param {Array} criteria - Acceptance criteria array
     * @returns {string} Formatted criteria
     * @private
     */
    _formatAcceptanceCriteria(criteria) {
        if (!criteria || criteria.length === 0) {
            return 'No specific acceptance criteria provided.';
        }

        return criteria.map((criterion, index) => 
            `${index + 1}. ${criterion}`
        ).join('\n');
    }

    /**
     * Format technical requirements
     * @param {Array} requirements - Technical requirements array
     * @returns {string} Formatted requirements
     * @private
     */
    _formatTechnicalRequirements(requirements) {
        if (!requirements || requirements.length === 0) {
            return 'No specific technical requirements provided.';
        }

        return requirements.map((req, index) => 
            `${index + 1}. ${req}`
        ).join('\n');
    }

    /**
     * Format project structure
     * @param {string} structure - Project structure
     * @returns {string} Formatted structure
     * @private
     */
    _formatProjectStructure(structure) {
        return structure || 'Project structure not available.';
    }

    /**
     * Format related files
     * @param {Array} files - Related files array
     * @returns {string} Formatted files
     * @private
     */
    _formatRelatedFiles(files) {
        if (!files || files.length === 0) {
            return 'No related files specified.';
        }

        return files.map(file => `- ${file}`).join('\n');
    }

    /**
     * Format dependencies
     * @param {Array} dependencies - Dependencies array
     * @returns {string} Formatted dependencies
     * @private
     */
    _formatDependencies(dependencies) {
        if (!dependencies || dependencies.length === 0) {
            return 'No dependencies specified.';
        }

        return dependencies.map(dep => `- ${dep}`).join('\n');
    }

    /**
     * Generate code style section
     * @param {Object} codeStyle - Code style configuration
     * @returns {string} Code style section
     * @private
     */
    _generateCodeStyleSection(codeStyle) {
        return `

## Code Style Guidelines
- **Language**: ${codeStyle.language}
- **Framework**: ${codeStyle.framework}
- **Test Framework**: ${codeStyle.testFramework}
- **Linting**: ${codeStyle.linting}
- **Formatting**: ${codeStyle.formatting}

## Quality Standards
- Follow ESLint rules and Prettier formatting
- Write self-documenting code with clear variable names
- Include JSDoc comments for functions and classes
- Implement proper error handling and logging
- Ensure code is testable and maintainable
`;
    }

    /**
     * Truncate prompt to maximum length
     * @param {string} prompt - Original prompt
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated prompt
     * @private
     */
    _truncatePrompt(prompt, maxLength) {
        if (prompt.length <= maxLength) {
            return prompt;
        }

        const truncated = prompt.substring(0, maxLength - 100);
        return truncated + '\n\n[Note: Prompt truncated due to length constraints]';
    }

    /**
     * Shutdown the prompt generator
     */
    async shutdown() {
        console.log('🤖 Shutting down prompt generator...');
        
        this.contextCache.clear();
        this.templates.clear();
        this.isInitialized = false;
        this.removeAllListeners();
        
        console.log('✅ Prompt generator shutdown complete');
    }
}

export default PromptGenerator;

