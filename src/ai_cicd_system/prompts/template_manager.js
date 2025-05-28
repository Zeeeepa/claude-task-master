/**
 * @fileoverview Template Manager
 * @description Manages prompt templates with versioning, caching, and dynamic selection
 *              based on task characteristics and complexity
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Template manager with versioning and intelligent selection
 */
export class TemplateManager {
    constructor(config = {}) {
        this.config = {
            template_cache_size: config.template_cache_size || 100,
            template_directory: config.template_directory || './templates/prompts',
            versioning_enabled: config.versioning_enabled !== false,
            auto_reload: config.auto_reload !== false,
            reload_interval: config.reload_interval || 300000, // 5 minutes
            template_validation: config.template_validation !== false,
            fallback_template: config.fallback_template || 'generic',
            ...config
        };

        // Template storage
        this.templates = new Map();
        this.templateVersions = new Map();
        this.templateCache = new Map();
        this.templateMetadata = new Map();

        // Usage tracking
        this.usageStatistics = new Map();
        this.cacheStatistics = {
            hits: 0,
            misses: 0,
            evictions: 0
        };

        // Template categories and complexity mappings
        this.templateCategories = {
            'bug_fix': {
                complexity_thresholds: { simple: 3, medium: 6, complex: 10 },
                required_variables: ['TASK_TITLE', 'TASK_DESCRIPTION', 'BUG_DESCRIPTION']
            },
            'feature': {
                complexity_thresholds: { simple: 4, medium: 7, complex: 10 },
                required_variables: ['TASK_TITLE', 'TASK_DESCRIPTION', 'REQUIREMENTS']
            },
            'refactor': {
                complexity_thresholds: { simple: 5, medium: 8, complex: 10 },
                required_variables: ['TASK_TITLE', 'TASK_DESCRIPTION', 'REFACTOR_GOALS']
            },
            'architecture': {
                complexity_thresholds: { simple: 7, medium: 9, complex: 10 },
                required_variables: ['TASK_TITLE', 'TASK_DESCRIPTION', 'ARCHITECTURE_GOALS']
            },
            'documentation': {
                complexity_thresholds: { simple: 2, medium: 5, complex: 8 },
                required_variables: ['TASK_TITLE', 'TASK_DESCRIPTION', 'DOC_TYPE']
            },
            'testing': {
                complexity_thresholds: { simple: 3, medium: 6, complex: 9 },
                required_variables: ['TASK_TITLE', 'TASK_DESCRIPTION', 'TEST_TYPE']
            }
        };

        log('info', 'Template Manager initialized');
    }

    /**
     * Initialize template manager
     */
    async initialize() {
        log('info', 'Initializing Template Manager...');

        try {
            // Ensure template directory exists
            await this._ensureTemplateDirectory();

            // Load templates from directory
            await this._loadTemplatesFromDirectory();

            // Load built-in templates if directory is empty
            if (this.templates.size === 0) {
                await this._loadBuiltInTemplates();
            }

            // Start auto-reload if enabled
            if (this.config.auto_reload) {
                this._startAutoReload();
            }

            log('info', `Template Manager initialized with ${this.templates.size} templates`);

        } catch (error) {
            log('error', `Failed to initialize Template Manager: ${error.message}`);
            throw error;
        }
    }

    /**
     * Select optimal template based on task type and complexity
     * @param {string} taskType - Type of task
     * @param {number} complexity - Complexity score (1-10)
     * @returns {Promise<Object>} Selected template
     */
    async selectTemplate(taskType = 'feature', complexity = 5) {
        const cacheKey = `${taskType}_${complexity}`;
        
        // Check cache first
        if (this.templateCache.has(cacheKey)) {
            this.cacheStatistics.hits++;
            const cached = this.templateCache.get(cacheKey);
            this._updateUsageStatistics(cached.id);
            return cached;
        }

        this.cacheStatistics.misses++;

        try {
            // Get category configuration
            const category = this.templateCategories[taskType] || this.templateCategories['feature'];
            
            // Determine complexity level
            const complexityLevel = this._determineComplexityLevel(complexity, category.complexity_thresholds);
            
            // Find best matching template
            const template = await this._findBestTemplate(taskType, complexityLevel);
            
            // Cache the result
            this._cacheTemplate(cacheKey, template);
            
            // Update usage statistics
            this._updateUsageStatistics(template.id);
            
            log('debug', `Selected template ${template.id} for ${taskType} (complexity: ${complexityLevel})`);
            return template;

        } catch (error) {
            log('error', `Failed to select template: ${error.message}`);
            
            // Return fallback template
            return await this._getFallbackTemplate();
        }
    }

    /**
     * Generate prompt from template
     * @param {Object} template - Template object
     * @param {Object} task - Task object
     * @param {Object} context - Context object
     * @returns {Promise<Object>} Generated prompt
     */
    async generatePrompt(template, task, context = {}) {
        const startTime = Date.now();
        
        try {
            log('debug', `Generating prompt using template ${template.id}`);

            // Prepare variables
            const variables = await this._prepareVariables(template, task, context);
            
            // Validate required variables
            await this._validateRequiredVariables(template, variables);
            
            // Process template content
            const content = await this._processTemplate(template, variables);
            
            // Create prompt object
            const prompt = {
                template_id: template.id,
                template_version: template.version,
                template_type: template.type,
                content: content,
                variables: variables,
                metadata: {
                    generated_at: new Date(),
                    generation_time_ms: Date.now() - startTime,
                    task_id: task.id,
                    complexity_level: template.complexity_level,
                    estimated_tokens: this._estimateTokenCount(content)
                }
            };

            log('debug', `Prompt generated successfully (${Date.now() - startTime}ms)`);
            return prompt;

        } catch (error) {
            log('error', `Failed to generate prompt: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add or update template
     * @param {Object} template - Template object
     * @returns {Promise<string>} Template ID
     */
    async addTemplate(template) {
        try {
            // Validate template structure
            await this._validateTemplate(template);
            
            // Generate ID if not provided
            if (!template.id) {
                template.id = this._generateTemplateId(template);
            }

            // Version the template
            if (this.config.versioning_enabled) {
                template.version = template.version || this._generateVersion();
                this._storeTemplateVersion(template);
            }

            // Store template
            this.templates.set(template.id, template);
            
            // Store metadata
            this.templateMetadata.set(template.id, {
                created_at: new Date(),
                updated_at: new Date(),
                usage_count: 0,
                last_used: null
            });

            // Save to file if directory is configured
            if (this.config.template_directory) {
                await this._saveTemplateToFile(template);
            }

            // Clear related cache entries
            this._clearRelatedCache(template.type);

            log('info', `Template ${template.id} added successfully`);
            return template.id;

        } catch (error) {
            log('error', `Failed to add template: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get template by ID
     * @param {string} templateId - Template ID
     * @returns {Promise<Object|null>} Template object or null
     */
    async getTemplate(templateId) {
        return this.templates.get(templateId) || null;
    }

    /**
     * List templates by type
     * @param {string} type - Template type
     * @returns {Promise<Array>} Array of templates
     */
    async listTemplates(type = null) {
        const templates = Array.from(this.templates.values());
        
        if (type) {
            return templates.filter(template => template.type === type);
        }
        
        return templates;
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStatistics() {
        return {
            ...this.cacheStatistics,
            cache_size: this.templateCache.size,
            hit_rate: this.cacheStatistics.hits / (this.cacheStatistics.hits + this.cacheStatistics.misses) || 0
        };
    }

    /**
     * Get usage statistics
     * @returns {Object} Usage statistics
     */
    getUsageStatistics() {
        return Object.fromEntries(this.usageStatistics);
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            templates_loaded: this.templates.size,
            cache_hit_rate: this.getCacheStatistics().hit_rate,
            auto_reload_enabled: this.config.auto_reload,
            versioning_enabled: this.config.versioning_enabled
        };
    }

    /**
     * Shutdown template manager
     */
    async shutdown() {
        log('info', 'Shutting down Template Manager...');

        // Clear all caches and data
        this.templates.clear();
        this.templateVersions.clear();
        this.templateCache.clear();
        this.templateMetadata.clear();
        this.usageStatistics.clear();

        log('info', 'Template Manager shut down');
    }

    // Private methods

    /**
     * Ensure template directory exists
     * @private
     */
    async _ensureTemplateDirectory() {
        try {
            await fs.access(this.config.template_directory);
        } catch (error) {
            log('info', `Creating template directory: ${this.config.template_directory}`);
            await fs.mkdir(this.config.template_directory, { recursive: true });
        }
    }

    /**
     * Load templates from directory
     * @private
     */
    async _loadTemplatesFromDirectory() {
        try {
            const files = await fs.readdir(this.config.template_directory);
            const templateFiles = files.filter(file => file.endsWith('.json'));

            for (const file of templateFiles) {
                try {
                    const filePath = path.join(this.config.template_directory, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const template = JSON.parse(content);
                    
                    if (this.config.template_validation) {
                        await this._validateTemplate(template);
                    }
                    
                    this.templates.set(template.id, template);
                    log('debug', `Loaded template: ${template.id}`);
                    
                } catch (error) {
                    log('warning', `Failed to load template from ${file}: ${error.message}`);
                }
            }

            log('info', `Loaded ${templateFiles.length} templates from directory`);

        } catch (error) {
            log('warning', `Failed to load templates from directory: ${error.message}`);
        }
    }

    /**
     * Load built-in templates
     * @private
     */
    async _loadBuiltInTemplates() {
        const builtInTemplates = [
            {
                id: 'bug_fix_simple',
                name: 'Simple Bug Fix',
                type: 'bug_fix',
                complexity_level: 'simple',
                version: '1.0.0',
                content: `# Bug Fix: {{TASK_TITLE}}

## Issue Description
{{TASK_DESCRIPTION}}

## Bug Details
{{BUG_DESCRIPTION}}

## Expected Behavior
{{EXPECTED_BEHAVIOR}}

## Current Behavior
{{CURRENT_BEHAVIOR}}

## Steps to Reproduce
{{REPRODUCTION_STEPS}}

## Proposed Solution
{{SOLUTION_APPROACH}}

## Files to Modify
{{TARGET_FILES}}

## Testing Requirements
- Verify the bug is fixed
- Ensure no regression in existing functionality
- Add appropriate unit tests`,
                variables: {
                    'BUG_DESCRIPTION': 'Description of the bug',
                    'EXPECTED_BEHAVIOR': 'What should happen',
                    'CURRENT_BEHAVIOR': 'What actually happens',
                    'REPRODUCTION_STEPS': 'Steps to reproduce the issue',
                    'SOLUTION_APPROACH': 'Proposed fix approach',
                    'TARGET_FILES': 'Files that need to be modified'
                }
            },
            {
                id: 'feature_medium',
                name: 'Medium Feature Development',
                type: 'feature',
                complexity_level: 'medium',
                version: '1.0.0',
                content: `# Feature Development: {{TASK_TITLE}}

## Feature Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Approach
{{TECHNICAL_APPROACH}}

## Implementation Plan
{{IMPLEMENTATION_PLAN}}

## Dependencies
{{DEPENDENCIES}}

## Files to Create/Modify
{{TARGET_FILES}}

## Testing Strategy
{{TESTING_STRATEGY}}

## Performance Considerations
{{PERFORMANCE_CONSIDERATIONS}}

## Security Considerations
{{SECURITY_CONSIDERATIONS}}`,
                variables: {
                    'REQUIREMENTS': 'Detailed feature requirements',
                    'ACCEPTANCE_CRITERIA': 'Criteria for feature completion',
                    'TECHNICAL_APPROACH': 'Technical implementation approach',
                    'IMPLEMENTATION_PLAN': 'Step-by-step implementation plan',
                    'DEPENDENCIES': 'Required dependencies',
                    'TARGET_FILES': 'Files to be created or modified',
                    'TESTING_STRATEGY': 'Testing approach and requirements',
                    'PERFORMANCE_CONSIDERATIONS': 'Performance requirements and optimizations',
                    'SECURITY_CONSIDERATIONS': 'Security requirements and considerations'
                }
            },
            {
                id: 'refactor_complex',
                name: 'Complex Refactoring',
                type: 'refactor',
                complexity_level: 'complex',
                version: '1.0.0',
                content: `# Code Refactoring: {{TASK_TITLE}}

## Refactoring Goals
{{TASK_DESCRIPTION}}

## Current Code Issues
{{CURRENT_ISSUES}}

## Proposed Improvements
{{IMPROVEMENTS}}

## Refactoring Strategy
{{REFACTORING_STRATEGY}}

## Architecture Changes
{{ARCHITECTURE_CHANGES}}

## Files to Refactor
{{TARGET_FILES}}

## Migration Plan
{{MIGRATION_PLAN}}

## Backward Compatibility
{{COMPATIBILITY_NOTES}}

## Performance Impact
{{PERFORMANCE_IMPACT}}

## Testing Plan
{{TESTING_PLAN}}

## Risk Assessment
{{RISK_ASSESSMENT}}`,
                variables: {
                    'CURRENT_ISSUES': 'Current problems with the code',
                    'IMPROVEMENTS': 'Proposed improvements',
                    'REFACTORING_STRATEGY': 'Overall refactoring approach',
                    'ARCHITECTURE_CHANGES': 'Architectural modifications',
                    'TARGET_FILES': 'Files to be refactored',
                    'MIGRATION_PLAN': 'Plan for migrating existing code',
                    'COMPATIBILITY_NOTES': 'Backward compatibility considerations',
                    'PERFORMANCE_IMPACT': 'Expected performance changes',
                    'TESTING_PLAN': 'Comprehensive testing strategy',
                    'RISK_ASSESSMENT': 'Potential risks and mitigation strategies'
                }
            },
            {
                id: 'generic_fallback',
                name: 'Generic Fallback Template',
                type: 'generic',
                complexity_level: 'medium',
                version: '1.0.0',
                content: `# Task: {{TASK_TITLE}}

## Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Implementation Notes
{{IMPLEMENTATION_NOTES}}

## Files Involved
{{TARGET_FILES}}

## Additional Context
{{ADDITIONAL_CONTEXT}}

## Instructions
Please implement the above requirements following best practices and ensuring code quality.`,
                variables: {
                    'REQUIREMENTS': 'Task requirements',
                    'IMPLEMENTATION_NOTES': 'Implementation guidance',
                    'TARGET_FILES': 'Relevant files',
                    'ADDITIONAL_CONTEXT': 'Any additional context'
                }
            }
        ];

        for (const template of builtInTemplates) {
            this.templates.set(template.id, template);
            this.templateMetadata.set(template.id, {
                created_at: new Date(),
                updated_at: new Date(),
                usage_count: 0,
                last_used: null,
                built_in: true
            });
        }

        log('info', `Loaded ${builtInTemplates.length} built-in templates`);
    }

    /**
     * Determine complexity level based on score and thresholds
     * @param {number} complexity - Complexity score
     * @param {Object} thresholds - Complexity thresholds
     * @returns {string} Complexity level
     * @private
     */
    _determineComplexityLevel(complexity, thresholds) {
        if (complexity <= thresholds.simple) return 'simple';
        if (complexity <= thresholds.medium) return 'medium';
        return 'complex';
    }

    /**
     * Find best matching template
     * @param {string} taskType - Task type
     * @param {string} complexityLevel - Complexity level
     * @returns {Promise<Object>} Best matching template
     * @private
     */
    async _findBestTemplate(taskType, complexityLevel) {
        // First, try exact match
        let candidates = Array.from(this.templates.values()).filter(
            template => template.type === taskType && template.complexity_level === complexityLevel
        );

        if (candidates.length > 0) {
            return this._selectBestCandidate(candidates);
        }

        // Try same type, different complexity
        candidates = Array.from(this.templates.values()).filter(
            template => template.type === taskType
        );

        if (candidates.length > 0) {
            return this._selectBestCandidate(candidates);
        }

        // Fallback to generic template
        return await this._getFallbackTemplate();
    }

    /**
     * Select best candidate from multiple templates
     * @param {Array} candidates - Candidate templates
     * @returns {Object} Best candidate
     * @private
     */
    _selectBestCandidate(candidates) {
        // Sort by usage count (most used first) and version (newest first)
        return candidates.sort((a, b) => {
            const usageA = this.usageStatistics.get(a.id) || 0;
            const usageB = this.usageStatistics.get(b.id) || 0;
            
            if (usageA !== usageB) {
                return usageB - usageA; // Higher usage first
            }
            
            // Compare versions
            return this._compareVersions(b.version, a.version);
        })[0];
    }

    /**
     * Get fallback template
     * @returns {Promise<Object>} Fallback template
     * @private
     */
    async _getFallbackTemplate() {
        const fallback = this.templates.get('generic_fallback');
        
        if (fallback) {
            return fallback;
        }

        // Create minimal fallback if none exists
        return {
            id: 'minimal_fallback',
            name: 'Minimal Fallback',
            type: 'generic',
            complexity_level: 'simple',
            version: '1.0.0',
            content: `# {{TASK_TITLE}}

{{TASK_DESCRIPTION}}

Please implement the above requirements.`,
            variables: {}
        };
    }

    /**
     * Cache template selection result
     * @param {string} cacheKey - Cache key
     * @param {Object} template - Template to cache
     * @private
     */
    _cacheTemplate(cacheKey, template) {
        // Check cache size limit
        if (this.templateCache.size >= this.config.template_cache_size) {
            // Remove oldest entry (LRU)
            const oldestKey = this.templateCache.keys().next().value;
            this.templateCache.delete(oldestKey);
            this.cacheStatistics.evictions++;
        }

        this.templateCache.set(cacheKey, template);
    }

    /**
     * Update usage statistics
     * @param {string} templateId - Template ID
     * @private
     */
    _updateUsageStatistics(templateId) {
        this.usageStatistics.set(templateId, (this.usageStatistics.get(templateId) || 0) + 1);
        
        const metadata = this.templateMetadata.get(templateId);
        if (metadata) {
            metadata.usage_count++;
            metadata.last_used = new Date();
        }
    }

    /**
     * Prepare variables for template processing
     * @param {Object} template - Template object
     * @param {Object} task - Task object
     * @param {Object} context - Context object
     * @returns {Promise<Object>} Prepared variables
     * @private
     */
    async _prepareVariables(template, task, context) {
        const variables = {
            // Basic task variables
            TASK_ID: task.id,
            TASK_TITLE: task.title || 'Untitled Task',
            TASK_DESCRIPTION: task.description || 'No description provided',
            TASK_TYPE: task.type || 'feature',
            TASK_PRIORITY: task.priority || 'medium',
            
            // Context variables
            REQUIREMENTS: this._formatRequirements(context.requirements || task.requirements),
            ACCEPTANCE_CRITERIA: this._formatAcceptanceCriteria(context.acceptance_criteria || task.acceptance_criteria),
            DEPENDENCIES: this._formatDependencies(context.dependencies || task.dependencies),
            TARGET_FILES: this._formatTargetFiles(context.target_files || task.files),
            
            // Template-specific variables
            ...template.variables,
            
            // Context-specific variables
            ...context
        };

        return variables;
    }

    /**
     * Validate required variables
     * @param {Object} template - Template object
     * @param {Object} variables - Variables object
     * @private
     */
    async _validateRequiredVariables(template, variables) {
        const category = this.templateCategories[template.type];
        
        if (category && category.required_variables) {
            for (const requiredVar of category.required_variables) {
                if (!variables[requiredVar]) {
                    log('warning', `Missing required variable: ${requiredVar} for template ${template.id}`);
                }
            }
        }
    }

    /**
     * Process template content with variables
     * @param {Object} template - Template object
     * @param {Object} variables - Variables object
     * @returns {Promise<string>} Processed content
     * @private
     */
    async _processTemplate(template, variables) {
        let content = template.content;

        // Replace all variables
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(placeholder, value || '');
        }

        return content;
    }

    /**
     * Validate template structure
     * @param {Object} template - Template to validate
     * @private
     */
    async _validateTemplate(template) {
        const required = ['id', 'name', 'type', 'content'];
        
        for (const field of required) {
            if (!template[field]) {
                throw new Error(`Template missing required field: ${field}`);
            }
        }

        if (typeof template.content !== 'string') {
            throw new Error('Template content must be a string');
        }
    }

    /**
     * Generate template ID
     * @param {Object} template - Template object
     * @returns {string} Generated ID
     * @private
     */
    _generateTemplateId(template) {
        const base = `${template.type}_${template.complexity_level || 'medium'}`;
        const timestamp = Date.now();
        return `${base}_${timestamp}`;
    }

    /**
     * Generate version string
     * @returns {string} Version string
     * @private
     */
    _generateVersion() {
        const now = new Date();
        return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}.${now.getHours()}${now.getMinutes()}`;
    }

    /**
     * Store template version
     * @param {Object} template - Template object
     * @private
     */
    _storeTemplateVersion(template) {
        const versionKey = `${template.id}_${template.version}`;
        this.templateVersions.set(versionKey, { ...template, stored_at: new Date() });
    }

    /**
     * Save template to file
     * @param {Object} template - Template to save
     * @private
     */
    async _saveTemplateToFile(template) {
        try {
            const filename = `${template.id}.json`;
            const filepath = path.join(this.config.template_directory, filename);
            await fs.writeFile(filepath, JSON.stringify(template, null, 2));
            log('debug', `Template ${template.id} saved to file`);
        } catch (error) {
            log('warning', `Failed to save template to file: ${error.message}`);
        }
    }

    /**
     * Clear related cache entries
     * @param {string} templateType - Template type
     * @private
     */
    _clearRelatedCache(templateType) {
        for (const [key] of this.templateCache.entries()) {
            if (key.startsWith(templateType)) {
                this.templateCache.delete(key);
            }
        }
    }

    /**
     * Start auto-reload interval
     * @private
     */
    _startAutoReload() {
        setInterval(async () => {
            try {
                await this._loadTemplatesFromDirectory();
                log('debug', 'Templates auto-reloaded');
            } catch (error) {
                log('warning', `Template auto-reload failed: ${error.message}`);
            }
        }, this.config.reload_interval);
    }

    /**
     * Compare version strings
     * @param {string} version1 - First version
     * @param {string} version2 - Second version
     * @returns {number} Comparison result
     * @private
     */
    _compareVersions(version1, version2) {
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;
            
            if (v1Part !== v2Part) {
                return v1Part - v2Part;
            }
        }
        
        return 0;
    }

    /**
     * Estimate token count
     * @param {string} content - Content to estimate
     * @returns {number} Estimated token count
     * @private
     */
    _estimateTokenCount(content) {
        return Math.ceil(content.length / 4);
    }

    /**
     * Format requirements
     * @param {any} requirements - Requirements to format
     * @returns {string} Formatted requirements
     * @private
     */
    _formatRequirements(requirements) {
        if (!requirements) return 'No specific requirements provided.';
        
        if (Array.isArray(requirements)) {
            return requirements.map((req, index) => `${index + 1}. ${req}`).join('\n');
        }
        
        if (typeof requirements === 'object') {
            return Object.entries(requirements)
                .map(([key, value]) => `- ${key}: ${value}`)
                .join('\n');
        }
        
        return requirements.toString();
    }

    /**
     * Format acceptance criteria
     * @param {any} criteria - Criteria to format
     * @returns {string} Formatted criteria
     * @private
     */
    _formatAcceptanceCriteria(criteria) {
        if (!criteria) return 'No specific acceptance criteria provided.';
        
        if (Array.isArray(criteria)) {
            return criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
        }
        
        return criteria.toString();
    }

    /**
     * Format dependencies
     * @param {any} dependencies - Dependencies to format
     * @returns {string} Formatted dependencies
     * @private
     */
    _formatDependencies(dependencies) {
        if (!dependencies) return 'No dependencies identified.';
        
        if (Array.isArray(dependencies)) {
            return dependencies.map(dep => 
                typeof dep === 'object' ? `- ${dep.name}: ${dep.version || 'latest'}` : `- ${dep}`
            ).join('\n');
        }
        
        return dependencies.toString();
    }

    /**
     * Format target files
     * @param {any} files - Files to format
     * @returns {string} Formatted files
     * @private
     */
    _formatTargetFiles(files) {
        if (!files) return 'Files to be determined during implementation.';
        
        if (Array.isArray(files)) {
            return files.map(file => `- ${file}`).join('\n');
        }
        
        return files.toString();
    }
}

export default TemplateManager;

