/**
 * @fileoverview Requirement Formatting Utilities
 * @description Utilities for formatting and structuring requirements for Codegen API
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Requirement Formatter - Formats various requirement inputs for Codegen
 */
export class RequirementFormatter {
    constructor(options = {}) {
        this.options = {
            includeMetadata: true,
            includeTimestamps: true,
            maxPromptLength: 8000,
            enableTemplating: true,
            ...options
        };

        // Template patterns for different requirement types
        this.templates = {
            feature: this.getFeatureTemplate(),
            bugfix: this.getBugfixTemplate(),
            refactor: this.getRefactorTemplate(),
            test: this.getTestTemplate(),
            documentation: this.getDocumentationTemplate()
        };

        log('debug', 'Requirement Formatter initialized');
    }

    /**
     * Format requirements for Codegen API
     * @param {Object} requirements - Requirements object
     * @param {Object} options - Formatting options
     * @returns {string} Formatted prompt
     */
    formatRequirements(requirements, options = {}) {
        const config = { ...this.options, ...options };
        
        try {
            log('debug', `Formatting requirements: ${requirements.title}`);

            // Determine requirement type
            const requirementType = this.detectRequirementType(requirements);
            
            // Get appropriate template
            const template = this.getTemplate(requirementType);
            
            // Format using template
            let formattedPrompt = this.applyTemplate(template, requirements);
            
            // Add metadata if enabled
            if (config.includeMetadata) {
                formattedPrompt = this.addMetadata(formattedPrompt, requirements, config);
            }
            
            // Validate and truncate if necessary
            formattedPrompt = this.validateAndTruncate(formattedPrompt, config);
            
            log('debug', `Requirements formatted successfully (${formattedPrompt.length} characters)`);
            return formattedPrompt;

        } catch (error) {
            log('error', `Failed to format requirements: ${error.message}`);
            throw new Error(`Requirement formatting failed: ${error.message}`);
        }
    }

    /**
     * Format Linear issue for Codegen
     * @param {Object} issue - Linear issue object
     * @param {Object} context - Additional context
     * @returns {string} Formatted prompt
     */
    formatLinearIssue(issue, context = {}) {
        const requirements = this.parseLinearIssue(issue);
        
        // Add context information
        if (context.repository) {
            requirements.repository = context.repository;
        }
        
        if (context.branch) {
            requirements.branch = context.branch;
        }
        
        if (context.contextFiles) {
            requirements.contextFiles = context.contextFiles;
        }

        return this.formatRequirements(requirements);
    }

    /**
     * Parse Linear issue into structured requirements
     * @param {Object} issue - Linear issue object
     * @returns {Object} Parsed requirements
     */
    parseLinearIssue(issue) {
        const description = issue.description || '';
        
        return {
            title: issue.title,
            description: description,
            acceptanceCriteria: this.extractAcceptanceCriteria(description),
            technicalSpecs: this.extractTechnicalSpecs(description),
            affectedFiles: this.extractAffectedFiles(description),
            dependencies: this.extractDependencies(description),
            priority: this.mapLinearPriority(issue.priority),
            labels: issue.labels || [],
            assignee: issue.assignee,
            metadata: {
                linearId: issue.id,
                linearUrl: issue.url,
                createdAt: issue.createdAt,
                updatedAt: issue.updatedAt
            }
        };
    }

    /**
     * Detect requirement type from content
     * @param {Object} requirements - Requirements object
     * @returns {string} Detected type
     */
    detectRequirementType(requirements) {
        const title = (requirements.title || '').toLowerCase();
        const description = (requirements.description || '').toLowerCase();
        const content = `${title} ${description}`;

        // Check for bug-related keywords
        if (this.containsKeywords(content, ['bug', 'fix', 'error', 'issue', 'broken', 'crash'])) {
            return 'bugfix';
        }

        // Check for test-related keywords
        if (this.containsKeywords(content, ['test', 'testing', 'spec', 'coverage', 'unit test', 'integration test'])) {
            return 'test';
        }

        // Check for refactor-related keywords
        if (this.containsKeywords(content, ['refactor', 'cleanup', 'optimize', 'improve', 'restructure'])) {
            return 'refactor';
        }

        // Check for documentation keywords
        if (this.containsKeywords(content, ['document', 'docs', 'readme', 'guide', 'documentation'])) {
            return 'documentation';
        }

        // Default to feature
        return 'feature';
    }

    /**
     * Check if content contains any of the specified keywords
     * @param {string} content - Content to check
     * @param {Array} keywords - Keywords to look for
     * @returns {boolean} Whether keywords are found
     */
    containsKeywords(content, keywords) {
        return keywords.some(keyword => content.includes(keyword));
    }

    /**
     * Get template for requirement type
     * @param {string} type - Requirement type
     * @returns {string} Template
     */
    getTemplate(type) {
        return this.templates[type] || this.templates.feature;
    }

    /**
     * Apply template to requirements
     * @param {string} template - Template string
     * @param {Object} requirements - Requirements object
     * @returns {string} Formatted content
     */
    applyTemplate(template, requirements) {
        let formatted = template;

        // Replace template variables
        const variables = {
            title: requirements.title || 'Untitled Task',
            description: requirements.description || 'No description provided',
            acceptanceCriteria: this.formatList(requirements.acceptanceCriteria),
            technicalSpecs: this.formatList(requirements.technicalSpecs),
            affectedFiles: this.formatList(requirements.affectedFiles),
            dependencies: this.formatList(requirements.dependencies),
            priority: requirements.priority || 'medium',
            repository: requirements.repository || 'current',
            branch: requirements.branch || 'main'
        };

        // Replace all variables in template
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            formatted = formatted.replace(regex, value);
        }

        return formatted;
    }

    /**
     * Format array as list
     * @param {Array} items - Items to format
     * @returns {string} Formatted list
     */
    formatList(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return 'None specified';
        }

        return items.map(item => `- ${item}`).join('\n');
    }

    /**
     * Add metadata to formatted prompt
     * @param {string} prompt - Base prompt
     * @param {Object} requirements - Requirements object
     * @param {Object} config - Configuration
     * @returns {string} Prompt with metadata
     */
    addMetadata(prompt, requirements, config) {
        let metadata = '\n\n---\n\n## Metadata\n\n';

        if (config.includeTimestamps) {
            metadata += `**Generated**: ${new Date().toISOString()}\n`;
        }

        if (requirements.metadata) {
            if (requirements.metadata.linearId) {
                metadata += `**Linear Issue**: ${requirements.metadata.linearId}\n`;
            }
            
            if (requirements.metadata.linearUrl) {
                metadata += `**Linear URL**: ${requirements.metadata.linearUrl}\n`;
            }
        }

        if (requirements.priority) {
            metadata += `**Priority**: ${requirements.priority}\n`;
        }

        if (requirements.labels && requirements.labels.length > 0) {
            metadata += `**Labels**: ${requirements.labels.join(', ')}\n`;
        }

        return prompt + metadata;
    }

    /**
     * Validate and truncate prompt if necessary
     * @param {string} prompt - Prompt to validate
     * @param {Object} config - Configuration
     * @returns {string} Validated prompt
     */
    validateAndTruncate(prompt, config) {
        if (prompt.length <= config.maxPromptLength) {
            return prompt;
        }

        log('warning', `Prompt length (${prompt.length}) exceeds maximum (${config.maxPromptLength}), truncating`);

        // Truncate while preserving structure
        const truncated = prompt.substring(0, config.maxPromptLength - 100);
        const lastNewline = truncated.lastIndexOf('\n');
        
        return truncated.substring(0, lastNewline) + '\n\n[Content truncated due to length limits]';
    }

    /**
     * Extract acceptance criteria from description
     * @param {string} description - Issue description
     * @returns {Array} Acceptance criteria
     */
    extractAcceptanceCriteria(description) {
        const patterns = [
            /## ✅ Acceptance Criteria\n([\s\S]*?)(?=\n##|$)/,
            /## Acceptance Criteria\n([\s\S]*?)(?=\n##|$)/,
            /Acceptance Criteria:?\n([\s\S]*?)(?=\n\n|$)/i
        ];

        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match) {
                return this.parseListItems(match[1]);
            }
        }

        return [];
    }

    /**
     * Extract technical specifications from description
     * @param {string} description - Issue description
     * @returns {Array} Technical specifications
     */
    extractTechnicalSpecs(description) {
        const patterns = [
            /## 📋 Technical Specifications\n([\s\S]*?)(?=\n##|$)/,
            /## Technical Specifications\n([\s\S]*?)(?=\n##|$)/,
            /Technical Requirements:?\n([\s\S]*?)(?=\n\n|$)/i
        ];

        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match) {
                return this.parseListItems(match[1]);
            }
        }

        return [];
    }

    /**
     * Extract affected files from description
     * @param {string} description - Issue description
     * @returns {Array} Affected files
     */
    extractAffectedFiles(description) {
        const patterns = [
            /## 📁 Affected Files\n([\s\S]*?)(?=\n##|$)/,
            /## Files to Modify\/Create\n([\s\S]*?)(?=\n##|$)/,
            /Files:?\n([\s\S]*?)(?=\n\n|$)/i
        ];

        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match) {
                return this.parseListItems(match[1]);
            }
        }

        // Also look for file patterns in code blocks
        const codeBlocks = description.match(/```[\s\S]*?```/g) || [];
        const files = [];
        
        codeBlocks.forEach(block => {
            const fileMatches = block.match(/\/\w+[\w\/]*\.\w+/g) || [];
            files.push(...fileMatches);
        });

        return [...new Set(files)]; // Remove duplicates
    }

    /**
     * Extract dependencies from description
     * @param {string} description - Issue description
     * @returns {Array} Dependencies
     */
    extractDependencies(description) {
        const patterns = [
            /## 🔗 Dependencies\n([\s\S]*?)(?=\n##|$)/,
            /## Dependencies\n([\s\S]*?)(?=\n##|$)/,
            /Dependencies:?\n([\s\S]*?)(?=\n\n|$)/i
        ];

        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match) {
                return this.parseListItems(match[1]);
            }
        }

        return [];
    }

    /**
     * Parse list items from text
     * @param {string} text - Text containing list items
     * @returns {Array} Parsed items
     */
    parseListItems(text) {
        const lines = text.split('\n');
        const items = [];

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Match various list formats
            const listMatch = trimmed.match(/^[-*+•]\s+(.+)$/) || 
                             trimmed.match(/^\d+\.\s+(.+)$/) ||
                             trimmed.match(/^-\s*\[\s*[x\s]\s*\]\s+(.+)$/);
            
            if (listMatch) {
                items.push(listMatch[1].trim());
            } else if (trimmed && !trimmed.startsWith('#')) {
                // Include non-empty lines that aren't headers
                items.push(trimmed);
            }
        }

        return items.filter(item => item.length > 0);
    }

    /**
     * Map Linear priority to standard priority
     * @param {number} linearPriority - Linear priority (1-4)
     * @returns {string} Standard priority
     */
    mapLinearPriority(linearPriority) {
        const priorityMap = {
            1: 'urgent',
            2: 'high',
            3: 'medium',
            4: 'low'
        };

        return priorityMap[linearPriority] || 'medium';
    }

    /**
     * Get feature template
     * @returns {string} Feature template
     */
    getFeatureTemplate() {
        return `# Feature Implementation: {{title}}

## Description
{{description}}

## Technical Requirements
{{technicalSpecs}}

## Acceptance Criteria
{{acceptanceCriteria}}

## Files to Modify/Create
{{affectedFiles}}

## Dependencies
{{dependencies}}

## Implementation Guidelines
- Follow existing code patterns and conventions
- Include comprehensive error handling
- Add appropriate logging and monitoring
- Write unit and integration tests
- Update documentation as needed
- Ensure backward compatibility where applicable

## Quality Standards
- Code should be production-ready
- All tests must pass
- Code coverage should be maintained or improved
- Security best practices must be followed
- Performance impact should be minimal

Please implement this feature following best practices and include comprehensive tests.`;
    }

    /**
     * Get bugfix template
     * @returns {string} Bugfix template
     */
    getBugfixTemplate() {
        return `# Bug Fix: {{title}}

## Problem Description
{{description}}

## Root Cause Analysis
Please analyze the root cause of this issue and implement a comprehensive fix.

## Acceptance Criteria
{{acceptanceCriteria}}

## Files to Investigate/Modify
{{affectedFiles}}

## Dependencies
{{dependencies}}

## Fix Requirements
- Identify and fix the root cause
- Add tests to prevent regression
- Ensure the fix doesn't break existing functionality
- Update error handling if necessary
- Add logging for debugging if appropriate

## Testing Requirements
- Write specific tests for the bug scenario
- Ensure all existing tests still pass
- Test edge cases related to the fix
- Verify the fix works in different environments

Please implement a robust fix that addresses the root cause and prevents similar issues in the future.`;
    }

    /**
     * Get refactor template
     * @returns {string} Refactor template
     */
    getRefactorTemplate() {
        return `# Code Refactoring: {{title}}

## Refactoring Goals
{{description}}

## Technical Specifications
{{technicalSpecs}}

## Success Criteria
{{acceptanceCriteria}}

## Files to Refactor
{{affectedFiles}}

## Dependencies
{{dependencies}}

## Refactoring Guidelines
- Maintain existing functionality (no breaking changes)
- Improve code readability and maintainability
- Optimize performance where possible
- Follow current architectural patterns
- Update documentation to reflect changes
- Ensure all tests continue to pass

## Quality Improvements
- Reduce code duplication
- Improve error handling
- Enhance type safety
- Optimize imports and dependencies
- Improve naming conventions

Please refactor the code while maintaining full backward compatibility and improving overall code quality.`;
    }

    /**
     * Get test template
     * @returns {string} Test template
     */
    getTestTemplate() {
        return `# Test Implementation: {{title}}

## Testing Objectives
{{description}}

## Test Requirements
{{technicalSpecs}}

## Test Coverage Goals
{{acceptanceCriteria}}

## Files to Test/Create
{{affectedFiles}}

## Dependencies
{{dependencies}}

## Test Implementation Guidelines
- Write comprehensive unit tests
- Include integration tests where appropriate
- Test both positive and negative scenarios
- Cover edge cases and error conditions
- Ensure tests are maintainable and readable
- Use appropriate mocking and stubbing

## Test Categories
- Unit tests for individual functions/methods
- Integration tests for component interactions
- End-to-end tests for complete workflows
- Performance tests if applicable
- Security tests for sensitive operations

Please implement thorough tests that provide confidence in the code quality and functionality.`;
    }

    /**
     * Get documentation template
     * @returns {string} Documentation template
     */
    getDocumentationTemplate() {
        return `# Documentation: {{title}}

## Documentation Scope
{{description}}

## Documentation Requirements
{{technicalSpecs}}

## Content Guidelines
{{acceptanceCriteria}}

## Files to Create/Update
{{affectedFiles}}

## Dependencies
{{dependencies}}

## Documentation Standards
- Use clear, concise language
- Include practical examples
- Provide step-by-step instructions
- Add diagrams or screenshots where helpful
- Ensure accuracy and completeness
- Follow existing documentation style

## Content Structure
- Overview and purpose
- Installation/setup instructions
- Usage examples
- API reference (if applicable)
- Troubleshooting guide
- FAQ section

Please create comprehensive documentation that helps users understand and effectively use the functionality.`;
    }

    /**
     * Get formatter health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            templates: Object.keys(this.templates),
            options: this.options,
            version: '1.0.0'
        };
    }
}

export default RequirementFormatter;

