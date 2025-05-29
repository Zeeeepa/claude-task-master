/**
 * @fileoverview Intelligent prompt generation engine
 * Converts atomic tasks into effective codegen prompts with context enhancement
 */

import { getTemplate } from './templates.js';
import { TASK_TYPES } from '../codegen_integration/types.js';

/**
 * PromptGenerator class for creating intelligent, context-aware prompts
 */
export class PromptGenerator {
    constructor(options = {}) {
        this.options = {
            maxContextSize: options.maxContextSize || 8000,
            includeCodeExamples: options.includeCodeExamples !== false,
            enhanceWithBestPractices: options.enhanceWithBestPractices !== false,
            ...options
        };
    }

    /**
     * Create an implementation prompt for a given task
     * @param {AtomicTask} task - The task to create a prompt for
     * @returns {string} Generated prompt
     */
    createImplementationPrompt(task) {
        const template = getTemplate(task.type || TASK_TYPES.IMPLEMENTATION);
        return this._fillTemplate(template, task);
    }

    /**
     * Add codebase context to an existing prompt
     * @param {string} prompt - The base prompt
     * @param {CodebaseContext} context - Codebase context information
     * @returns {string} Enhanced prompt with context
     */
    addCodebaseContext(prompt, context) {
        if (!context) return prompt;

        const contextSection = this._buildCodebaseContextSection(context);
        return prompt.replace('{codebase_context}', contextSection);
    }

    /**
     * Include acceptance criteria in the prompt
     * @param {string} prompt - The base prompt
     * @param {string[]} criteria - List of acceptance criteria
     * @returns {string} Enhanced prompt with criteria
     */
    includeAcceptanceCriteria(prompt, criteria) {
        if (!criteria || criteria.length === 0) {
            return prompt.replace('{acceptance_criteria}', 'No specific acceptance criteria provided.');
        }

        const criteriaText = criteria
            .map((criterion, index) => `${index + 1}. ${criterion}`)
            .join('\n');

        return prompt.replace('{acceptance_criteria}', criteriaText);
    }

    /**
     * Format prompt for codegen API consumption
     * @param {string} prompt - The formatted prompt
     * @param {string} taskType - Type of task
     * @returns {CodegenPrompt} Formatted codegen prompt object
     */
    formatForCodegen(prompt, taskType) {
        return {
            content: prompt,
            task_type: taskType,
            metadata: {
                generated_at: new Date().toISOString(),
                generator_version: '1.0.0',
                estimated_complexity: this._estimateComplexity(prompt),
                validation_requirements: this._extractValidationRequirements(prompt)
            }
        };
    }

    /**
     * Generate a complete prompt from task and context
     * @param {AtomicTask} task - The task to generate a prompt for
     * @param {TaskContext} context - Task context information
     * @returns {CodegenPrompt} Complete codegen prompt
     */
    generatePrompt(task, context) {
        let prompt = this.createImplementationPrompt(task);
        
        // Add codebase context
        if (context?.codebase_context) {
            prompt = this.addCodebaseContext(prompt, context.codebase_context);
        }

        // Add acceptance criteria
        if (task.acceptance_criteria) {
            prompt = this.includeAcceptanceCriteria(prompt, task.acceptance_criteria);
        }

        // Enhance with additional context
        prompt = this._enhanceWithTaskContext(prompt, task, context);

        // Apply size optimization if needed
        if (prompt.length > this.options.maxContextSize) {
            prompt = this._optimizePromptSize(prompt);
        }

        return this.formatForCodegen(prompt, task.type);
    }

    /**
     * Fill template with task data
     * @private
     * @param {string} template - Template string
     * @param {AtomicTask} task - Task data
     * @returns {string} Filled template
     */
    _fillTemplate(template, task) {
        const replacements = {
            task_title: task.title || 'Untitled Task',
            task_description: task.description || 'No description provided',
            priority: task.priority || 'Medium',
            requirements_list: this._formatList(task.requirements),
            acceptance_criteria: this._formatList(task.acceptance_criteria),
            affected_files: this._formatList(task.affected_files),
            additional_notes: task.metadata?.notes || 'None'
        };

        let filledTemplate = template;
        for (const [key, value] of Object.entries(replacements)) {
            const placeholder = `{${key}}`;
            filledTemplate = filledTemplate.replace(new RegExp(placeholder, 'g'), value);
        }

        return filledTemplate;
    }

    /**
     * Build codebase context section
     * @private
     * @param {CodebaseContext} context - Codebase context
     * @returns {string} Formatted context section
     */
    _buildCodebaseContextSection(context) {
        const sections = [];

        if (context.language) {
            sections.push(`**Primary Language**: ${context.language}`);
        }

        if (context.framework) {
            sections.push(`**Framework**: ${context.framework}`);
        }

        if (context.key_files && context.key_files.length > 0) {
            sections.push(`**Key Files**:\n${context.key_files.map(file => `- ${file}`).join('\n')}`);
        }

        if (context.coding_standards && context.coding_standards.length > 0) {
            sections.push(`**Coding Standards**:\n${context.coding_standards.map(standard => `- ${standard}`).join('\n')}`);
        }

        if (context.test_patterns && context.test_patterns.length > 0) {
            sections.push(`**Testing Patterns**:\n${context.test_patterns.map(pattern => `- ${pattern}`).join('\n')}`);
        }

        if (context.file_structure) {
            sections.push(`**File Structure**:\n\`\`\`\n${JSON.stringify(context.file_structure, null, 2)}\n\`\`\``);
        }

        return sections.join('\n\n');
    }

    /**
     * Enhance prompt with additional task context
     * @private
     * @param {string} prompt - Base prompt
     * @param {AtomicTask} task - Task information
     * @param {TaskContext} context - Task context
     * @returns {string} Enhanced prompt
     */
    _enhanceWithTaskContext(prompt, task, context) {
        const enhancements = {};

        // Add project context
        if (context?.project_name) {
            enhancements.project_name = context.project_name;
        }

        // Add environment details
        if (context?.environment) {
            enhancements.environment_details = JSON.stringify(context.environment, null, 2);
        }

        // Add dependencies
        if (context?.dependencies) {
            enhancements.dependencies = this._formatList(context.dependencies);
        }

        // Add validation requirements
        if (task.metadata?.validation_requirements) {
            enhancements.validation_requirements = this._formatList(task.metadata.validation_requirements);
        }

        // Apply enhancements
        let enhancedPrompt = prompt;
        for (const [key, value] of Object.entries(enhancements)) {
            const placeholder = `{${key}}`;
            enhancedPrompt = enhancedPrompt.replace(new RegExp(placeholder, 'g'), value);
        }

        // Clean up any remaining placeholders
        enhancedPrompt = this._cleanupPlaceholders(enhancedPrompt);

        return enhancedPrompt;
    }

    /**
     * Format array as a bulleted list
     * @private
     * @param {string[]} items - Items to format
     * @returns {string} Formatted list
     */
    _formatList(items) {
        if (!items || items.length === 0) {
            return 'None specified';
        }
        return items.map(item => `- ${item}`).join('\n');
    }

    /**
     * Estimate complexity of a task based on prompt content
     * @private
     * @param {string} prompt - The prompt to analyze
     * @returns {number} Complexity score (1-10)
     */
    _estimateComplexity(prompt) {
        let complexity = 1;

        // Length-based complexity
        if (prompt.length > 2000) complexity += 2;
        if (prompt.length > 4000) complexity += 2;

        // Keyword-based complexity
        const complexityKeywords = [
            'database', 'migration', 'api', 'integration', 'security',
            'performance', 'optimization', 'refactor', 'architecture'
        ];

        const keywordMatches = complexityKeywords.filter(keyword => 
            prompt.toLowerCase().includes(keyword)
        ).length;

        complexity += Math.min(keywordMatches, 4);

        return Math.min(complexity, 10);
    }

    /**
     * Extract validation requirements from prompt
     * @private
     * @param {string} prompt - The prompt to analyze
     * @returns {string[]} List of validation requirements
     */
    _extractValidationRequirements(prompt) {
        const requirements = [];

        if (prompt.includes('test')) {
            requirements.push('Comprehensive testing required');
        }

        if (prompt.includes('security')) {
            requirements.push('Security review required');
        }

        if (prompt.includes('performance')) {
            requirements.push('Performance validation required');
        }

        if (prompt.includes('documentation')) {
            requirements.push('Documentation update required');
        }

        return requirements;
    }

    /**
     * Optimize prompt size by removing less critical sections
     * @private
     * @param {string} prompt - The prompt to optimize
     * @returns {string} Optimized prompt
     */
    _optimizePromptSize(prompt) {
        // Remove excessive whitespace
        let optimized = prompt.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        // If still too large, remove optional sections
        if (optimized.length > this.options.maxContextSize) {
            // Remove additional notes section if present
            optimized = optimized.replace(/## Additional Notes[\s\S]*?(?=##|$)/g, '');
        }

        return optimized;
    }

    /**
     * Clean up any remaining template placeholders
     * @private
     * @param {string} prompt - Prompt with potential placeholders
     * @returns {string} Cleaned prompt
     */
    _cleanupPlaceholders(prompt) {
        // Replace any remaining placeholders with default values
        return prompt.replace(/\{[^}]+\}/g, 'Not specified');
    }
}

/**
 * Create a new prompt generator instance
 * @param {Object} options - Configuration options
 * @returns {PromptGenerator} New prompt generator instance
 */
export function createPromptGenerator(options = {}) {
    return new PromptGenerator(options);
}

export default PromptGenerator;

