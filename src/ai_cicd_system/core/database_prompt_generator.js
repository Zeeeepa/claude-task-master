/**
 * @fileoverview Database-Driven Prompt Generator
 * @description Generates intelligent prompts by retrieving task context from PostgreSQL
 *              and selecting optimal templates based on task characteristics
 */

import { log } from '../../../scripts/modules/utils.js';
import { DatabaseConnection } from '../database/connection.js';

/**
 * Database-driven prompt generator with intelligent template selection
 */
export class DatabasePromptGenerator {
    constructor(config = {}) {
        this.config = {
            connection_pool_size: config.connection_pool_size || 10,
            query_timeout: config.query_timeout || 30000,
            retry_attempts: config.retry_attempts || 3,
            template_cache_ttl: config.template_cache_ttl || 3600000, // 1 hour
            context_cache_ttl: config.context_cache_ttl || 1800000,   // 30 minutes
            max_context_size: config.max_context_size || 50000,
            enable_analytics: config.enable_analytics !== false,
            ...config
        };

        this.dbConnection = null;
        this.templateCache = new Map();
        this.contextCache = new Map();
        this.promptVersions = new Map();
        this.analytics = {
            prompts_generated: 0,
            cache_hits: 0,
            cache_misses: 0,
            avg_generation_time: 0,
            template_usage: new Map()
        };

        log('info', 'Database Prompt Generator initialized');
    }

    /**
     * Initialize database connection and prepare prompt templates
     */
    async initialize() {
        log('info', 'Initializing Database Prompt Generator...');

        try {
            // Initialize database connection
            this.dbConnection = new DatabaseConnection(this.config);
            await this.dbConnection.connect();

            // Ensure prompt-related tables exist
            await this._ensurePromptTables();

            // Load and cache prompt templates
            await this._loadPromptTemplates();

            // Start cache cleanup interval
            this._startCacheCleanup();

            log('info', 'Database Prompt Generator initialized successfully');

        } catch (error) {
            log('error', `Failed to initialize Database Prompt Generator: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate intelligent prompt based on task and context from database
     * @param {Object} task - Task object
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Generated prompt with metadata
     */
    async generatePrompt(task, context = {}) {
        const startTime = Date.now();
        log('debug', `Generating database-driven prompt for task ${task.id}`);

        try {
            // Step 1: Retrieve task context from database
            const taskContext = await this._getTaskContext(task.id);
            
            // Step 2: Get related tasks and dependencies
            const relatedContext = await this._getRelatedTasksContext(task);
            
            // Step 3: Retrieve codebase analysis if available
            const codebaseContext = await this._getCodebaseContext(task);
            
            // Step 4: Select optimal template
            const template = await this._selectOptimalTemplate(task, taskContext);
            
            // Step 5: Merge all context
            const mergedContext = this._mergeContexts(context, taskContext, relatedContext, codebaseContext);
            
            // Step 6: Generate prompt content
            const promptContent = await this._generatePromptContent(template, task, mergedContext);
            
            // Step 7: Add metadata and versioning
            const prompt = {
                task_id: task.id,
                template_id: template.id,
                template_version: template.version,
                content: promptContent,
                context: mergedContext,
                metadata: {
                    generated_at: new Date(),
                    generation_time_ms: Date.now() - startTime,
                    template_type: template.type,
                    context_sources: this._getContextSources(taskContext, relatedContext, codebaseContext),
                    complexity_score: this._calculateComplexityScore(task, mergedContext),
                    estimated_tokens: this._estimateTokenCount(promptContent)
                }
            };

            // Step 8: Store prompt version for tracking
            await this._storePromptVersion(task.id, prompt);

            // Update analytics
            this._updateAnalytics(template, Date.now() - startTime);

            log('debug', `Generated prompt for task ${task.id} (${Date.now() - startTime}ms)`);
            return prompt;

        } catch (error) {
            log('error', `Failed to generate prompt for task ${task.id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Store prompt version for consistency tracking
     * @param {string} taskId - Task ID
     * @param {Object} prompt - Prompt object
     * @param {string} version - Version string
     */
    async storePromptVersion(taskId, prompt, version) {
        try {
            const query = `
                INSERT INTO prompt_versions (task_id, version, template_id, content, context, metadata, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (task_id, version) DO UPDATE SET
                    content = EXCLUDED.content,
                    context = EXCLUDED.context,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
            `;

            await this.dbConnection.query(query, [
                taskId,
                version,
                prompt.template_id,
                JSON.stringify(prompt.content),
                JSON.stringify(prompt.context),
                JSON.stringify(prompt.metadata)
            ]);

            this.promptVersions.set(`${taskId}_${version}`, prompt);
            log('debug', `Stored prompt version ${version} for task ${taskId}`);

        } catch (error) {
            log('error', `Failed to store prompt version: ${error.message}`);
            throw error;
        }
    }

    /**
     * Retrieve prompt version
     * @param {string} taskId - Task ID
     * @param {string} version - Version string
     * @returns {Promise<Object|null>} Prompt object or null
     */
    async getPromptVersion(taskId, version) {
        const cacheKey = `${taskId}_${version}`;
        
        // Check cache first
        if (this.promptVersions.has(cacheKey)) {
            return this.promptVersions.get(cacheKey);
        }

        try {
            const query = `
                SELECT template_id, content, context, metadata, created_at
                FROM prompt_versions
                WHERE task_id = $1 AND version = $2
            `;

            const result = await this.dbConnection.query(query, [taskId, version]);
            
            if (result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];
            const prompt = {
                task_id: taskId,
                template_id: row.template_id,
                content: JSON.parse(row.content),
                context: JSON.parse(row.context),
                metadata: JSON.parse(row.metadata),
                version: version,
                created_at: row.created_at
            };

            // Cache for future use
            this.promptVersions.set(cacheKey, prompt);
            return prompt;

        } catch (error) {
            log('error', `Failed to retrieve prompt version: ${error.message}`);
            return null;
        }
    }

    /**
     * Get statistics about prompt generation
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
        const dbStats = await this._getDatabaseStatistics();
        
        return {
            ...this.analytics,
            database: dbStats,
            cache: {
                template_cache_size: this.templateCache.size,
                context_cache_size: this.contextCache.size,
                prompt_versions_cached: this.promptVersions.size,
                hit_rate: this.analytics.cache_hits / (this.analytics.cache_hits + this.analytics.cache_misses) || 0
            },
            performance: {
                avg_generation_time_ms: this.analytics.avg_generation_time,
                total_prompts_generated: this.analytics.prompts_generated
            }
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        try {
            // Test database connection
            await this.dbConnection.query('SELECT 1');
            
            return {
                status: 'healthy',
                database_connected: true,
                cache_status: {
                    templates: this.templateCache.size,
                    contexts: this.contextCache.size,
                    versions: this.promptVersions.size
                },
                last_generation: this.analytics.prompts_generated > 0 ? 'recent' : 'none'
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                database_connected: false
            };
        }
    }

    /**
     * Shutdown and cleanup
     */
    async shutdown() {
        log('info', 'Shutting down Database Prompt Generator...');

        // Clear caches
        this.templateCache.clear();
        this.contextCache.clear();
        this.promptVersions.clear();

        // Close database connection
        if (this.dbConnection) {
            await this.dbConnection.close();
        }

        log('info', 'Database Prompt Generator shut down');
    }

    // Private methods

    /**
     * Ensure prompt-related database tables exist
     * @private
     */
    async _ensurePromptTables() {
        const tables = [
            {
                name: 'prompt_templates',
                schema: `
                    CREATE TABLE IF NOT EXISTS prompt_templates (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) UNIQUE NOT NULL,
                        type VARCHAR(100) NOT NULL,
                        version VARCHAR(50) NOT NULL,
                        template_content TEXT NOT NULL,
                        variables JSONB,
                        metadata JSONB,
                        is_active BOOLEAN DEFAULT true,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                `
            },
            {
                name: 'prompt_versions',
                schema: `
                    CREATE TABLE IF NOT EXISTS prompt_versions (
                        id SERIAL PRIMARY KEY,
                        task_id VARCHAR(255) NOT NULL,
                        version VARCHAR(100) NOT NULL,
                        template_id INTEGER REFERENCES prompt_templates(id),
                        content TEXT NOT NULL,
                        context JSONB,
                        metadata JSONB,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(task_id, version)
                    )
                `
            },
            {
                name: 'task_contexts',
                schema: `
                    CREATE TABLE IF NOT EXISTS task_contexts (
                        id SERIAL PRIMARY KEY,
                        task_id VARCHAR(255) UNIQUE NOT NULL,
                        codebase_analysis JSONB,
                        dependencies JSONB,
                        requirements JSONB,
                        constraints JSONB,
                        performance_data JSONB,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                `
            }
        ];

        for (const table of tables) {
            try {
                await this.dbConnection.query(table.schema);
                log('debug', `Ensured table ${table.name} exists`);
            } catch (error) {
                log('error', `Failed to create table ${table.name}: ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Load prompt templates from database
     * @private
     */
    async _loadPromptTemplates() {
        try {
            const query = `
                SELECT id, name, type, version, template_content, variables, metadata
                FROM prompt_templates
                WHERE is_active = true
                ORDER BY type, version DESC
            `;

            const result = await this.dbConnection.query(query);
            
            for (const row of result.rows) {
                const template = {
                    id: row.id,
                    name: row.name,
                    type: row.type,
                    version: row.version,
                    content: row.template_content,
                    variables: row.variables || {},
                    metadata: row.metadata || {}
                };

                this.templateCache.set(`${row.type}_${row.version}`, template);
            }

            log('info', `Loaded ${result.rows.length} prompt templates`);

        } catch (error) {
            log('error', `Failed to load prompt templates: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get task context from database
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task context
     * @private
     */
    async _getTaskContext(taskId) {
        const cacheKey = `context_${taskId}`;
        
        // Check cache first
        if (this.contextCache.has(cacheKey)) {
            this.analytics.cache_hits++;
            return this.contextCache.get(cacheKey);
        }

        this.analytics.cache_misses++;

        try {
            const query = `
                SELECT codebase_analysis, dependencies, requirements, constraints, performance_data
                FROM task_contexts
                WHERE task_id = $1
            `;

            const result = await this.dbConnection.query(query, [taskId]);
            
            const context = result.rows.length > 0 ? {
                codebase_analysis: result.rows[0].codebase_analysis || {},
                dependencies: result.rows[0].dependencies || [],
                requirements: result.rows[0].requirements || {},
                constraints: result.rows[0].constraints || {},
                performance_data: result.rows[0].performance_data || {}
            } : {};

            // Cache the result
            this.contextCache.set(cacheKey, context);
            return context;

        } catch (error) {
            log('error', `Failed to get task context for ${taskId}: ${error.message}`);
            return {};
        }
    }

    /**
     * Get related tasks context
     * @param {Object} task - Task object
     * @returns {Promise<Object>} Related context
     * @private
     */
    async _getRelatedTasksContext(task) {
        try {
            const query = `
                SELECT t.id, t.title, t.description, t.status, tc.requirements
                FROM tasks t
                LEFT JOIN task_contexts tc ON t.id = tc.task_id
                WHERE t.project_id = $1 AND t.id != $2
                AND (t.status = 'completed' OR t.status = 'in_progress')
                ORDER BY t.updated_at DESC
                LIMIT 10
            `;

            const result = await this.dbConnection.query(query, [task.project_id || 'default', task.id]);
            
            return {
                related_tasks: result.rows.map(row => ({
                    id: row.id,
                    title: row.title,
                    description: row.description,
                    status: row.status,
                    requirements: row.requirements || {}
                }))
            };

        } catch (error) {
            log('error', `Failed to get related tasks context: ${error.message}`);
            return { related_tasks: [] };
        }
    }

    /**
     * Get codebase context
     * @param {Object} task - Task object
     * @returns {Promise<Object>} Codebase context
     * @private
     */
    async _getCodebaseContext(task) {
        try {
            const query = `
                SELECT analysis_data, file_structure, dependencies, metrics
                FROM codebase_analysis
                WHERE project_id = $1
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await this.dbConnection.query(query, [task.project_id || 'default']);
            
            if (result.rows.length === 0) {
                return { codebase_analysis: null };
            }

            const row = result.rows[0];
            return {
                codebase_analysis: {
                    analysis_data: row.analysis_data || {},
                    file_structure: row.file_structure || {},
                    dependencies: row.dependencies || [],
                    metrics: row.metrics || {}
                }
            };

        } catch (error) {
            log('error', `Failed to get codebase context: ${error.message}`);
            return { codebase_analysis: null };
        }
    }

    /**
     * Select optimal template based on task characteristics
     * @param {Object} task - Task object
     * @param {Object} context - Task context
     * @returns {Promise<Object>} Selected template
     * @private
     */
    async _selectOptimalTemplate(task, context) {
        const taskType = task.type || 'feature';
        const complexity = this._calculateComplexityScore(task, context);
        
        // Try to find the best matching template
        const templateKeys = Array.from(this.templateCache.keys());
        const typeTemplates = templateKeys.filter(key => key.startsWith(taskType));
        
        if (typeTemplates.length === 0) {
            // Fallback to generic template
            const genericTemplates = templateKeys.filter(key => key.startsWith('generic'));
            if (genericTemplates.length > 0) {
                return this.templateCache.get(genericTemplates[0]);
            }
            
            // Create default template if none exists
            return this._createDefaultTemplate(taskType);
        }

        // Select template based on complexity
        const selectedKey = complexity > 7 
            ? typeTemplates.find(key => key.includes('complex')) || typeTemplates[0]
            : typeTemplates[0];

        const template = this.templateCache.get(selectedKey);
        
        // Track template usage
        this.analytics.template_usage.set(template.id, 
            (this.analytics.template_usage.get(template.id) || 0) + 1);

        return template;
    }

    /**
     * Merge multiple context sources
     * @param {...Object} contexts - Context objects to merge
     * @returns {Object} Merged context
     * @private
     */
    _mergeContexts(...contexts) {
        const merged = {};
        
        for (const context of contexts) {
            if (context && typeof context === 'object') {
                Object.assign(merged, context);
            }
        }

        // Ensure context size doesn't exceed limits
        const contextString = JSON.stringify(merged);
        if (contextString.length > this.config.max_context_size) {
            log('warning', `Context size (${contextString.length}) exceeds limit, truncating`);
            return this._truncateContext(merged);
        }

        return merged;
    }

    /**
     * Generate prompt content from template and context
     * @param {Object} template - Template object
     * @param {Object} task - Task object
     * @param {Object} context - Merged context
     * @returns {Promise<string>} Generated prompt content
     * @private
     */
    async _generatePromptContent(template, task, context) {
        let content = template.content;
        
        // Replace template variables
        const variables = {
            TASK_ID: task.id,
            TASK_TITLE: task.title || 'Untitled Task',
            TASK_DESCRIPTION: task.description || 'No description provided',
            TASK_TYPE: task.type || 'feature',
            TASK_PRIORITY: task.priority || 'medium',
            REQUIREMENTS: this._formatRequirements(context.requirements || {}),
            DEPENDENCIES: this._formatDependencies(context.dependencies || []),
            CODEBASE_CONTEXT: this._formatCodebaseContext(context.codebase_analysis),
            RELATED_TASKS: this._formatRelatedTasks(context.related_tasks || []),
            CONSTRAINTS: this._formatConstraints(context.constraints || {}),
            PERFORMANCE_DATA: this._formatPerformanceData(context.performance_data || {}),
            ...template.variables
        };

        // Replace all variables in content
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(placeholder, value || '');
        }

        return content;
    }

    /**
     * Calculate complexity score for task and context
     * @param {Object} task - Task object
     * @param {Object} context - Context object
     * @returns {number} Complexity score (1-10)
     * @private
     */
    _calculateComplexityScore(task, context) {
        let score = 1;

        // Task-based complexity
        if (task.type === 'refactor') score += 2;
        if (task.type === 'architecture') score += 3;
        if (task.priority === 'high') score += 1;

        // Context-based complexity
        if (context.dependencies && context.dependencies.length > 5) score += 2;
        if (context.codebase_analysis && Object.keys(context.codebase_analysis).length > 0) score += 1;
        if (context.related_tasks && context.related_tasks.length > 3) score += 1;
        if (context.constraints && Object.keys(context.constraints).length > 0) score += 1;

        return Math.min(score, 10);
    }

    /**
     * Estimate token count for content
     * @param {string} content - Content to estimate
     * @returns {number} Estimated token count
     * @private
     */
    _estimateTokenCount(content) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(content.length / 4);
    }

    /**
     * Get context sources for metadata
     * @param {Object} taskContext - Task context
     * @param {Object} relatedContext - Related context
     * @param {Object} codebaseContext - Codebase context
     * @returns {Array} Context sources
     * @private
     */
    _getContextSources(taskContext, relatedContext, codebaseContext) {
        const sources = [];
        
        if (Object.keys(taskContext).length > 0) sources.push('task_database');
        if (relatedContext.related_tasks && relatedContext.related_tasks.length > 0) sources.push('related_tasks');
        if (codebaseContext.codebase_analysis) sources.push('codebase_analysis');
        
        return sources;
    }

    /**
     * Store prompt version in database
     * @param {string} taskId - Task ID
     * @param {Object} prompt - Prompt object
     * @private
     */
    async _storePromptVersion(taskId, prompt) {
        try {
            const version = `v${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            await this.storePromptVersion(taskId, prompt, version);
            prompt.version = version;
        } catch (error) {
            log('warning', `Failed to store prompt version: ${error.message}`);
        }
    }

    /**
     * Update analytics
     * @param {Object} template - Template used
     * @param {number} generationTime - Generation time in ms
     * @private
     */
    _updateAnalytics(template, generationTime) {
        this.analytics.prompts_generated++;
        this.analytics.avg_generation_time = 
            (this.analytics.avg_generation_time * (this.analytics.prompts_generated - 1) + generationTime) / 
            this.analytics.prompts_generated;
    }

    /**
     * Get database statistics
     * @returns {Promise<Object>} Database statistics
     * @private
     */
    async _getDatabaseStatistics() {
        try {
            const queries = [
                'SELECT COUNT(*) as template_count FROM prompt_templates WHERE is_active = true',
                'SELECT COUNT(*) as version_count FROM prompt_versions',
                'SELECT COUNT(*) as context_count FROM task_contexts'
            ];

            const results = await Promise.all(
                queries.map(query => this.dbConnection.query(query))
            );

            return {
                active_templates: parseInt(results[0].rows[0].template_count),
                stored_versions: parseInt(results[1].rows[0].version_count),
                task_contexts: parseInt(results[2].rows[0].context_count)
            };

        } catch (error) {
            log('error', `Failed to get database statistics: ${error.message}`);
            return {};
        }
    }

    /**
     * Start cache cleanup interval
     * @private
     */
    _startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            
            // Clean context cache
            for (const [key, entry] of this.contextCache.entries()) {
                if (now - entry.timestamp > this.config.context_cache_ttl) {
                    this.contextCache.delete(key);
                }
            }

            // Clean template cache periodically
            if (this.templateCache.size > 100) {
                this._loadPromptTemplates(); // Refresh templates
            }

        }, 300000); // Every 5 minutes
    }

    /**
     * Create default template for task type
     * @param {string} taskType - Task type
     * @returns {Object} Default template
     * @private
     */
    _createDefaultTemplate(taskType) {
        return {
            id: `default_${taskType}`,
            name: `Default ${taskType} Template`,
            type: taskType,
            version: '1.0.0',
            content: `# ${taskType.charAt(0).toUpperCase() + taskType.slice(1)}: {{TASK_TITLE}}

## Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Dependencies
{{DEPENDENCIES}}

## Context
{{CODEBASE_CONTEXT}}

## Instructions
Please implement the above requirements following best practices.`,
            variables: {},
            metadata: { auto_generated: true }
        };
    }

    /**
     * Format requirements for prompt
     * @param {Object} requirements - Requirements object
     * @returns {string} Formatted requirements
     * @private
     */
    _formatRequirements(requirements) {
        if (!requirements || Object.keys(requirements).length === 0) {
            return 'No specific requirements provided.';
        }

        return Object.entries(requirements)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');
    }

    /**
     * Format dependencies for prompt
     * @param {Array} dependencies - Dependencies array
     * @returns {string} Formatted dependencies
     * @private
     */
    _formatDependencies(dependencies) {
        if (!Array.isArray(dependencies) || dependencies.length === 0) {
            return 'No dependencies identified.';
        }

        return dependencies.map(dep => `- ${dep.name || dep}: ${dep.version || ''}`).join('\n');
    }

    /**
     * Format codebase context for prompt
     * @param {Object} codebaseAnalysis - Codebase analysis
     * @returns {string} Formatted codebase context
     * @private
     */
    _formatCodebaseContext(codebaseAnalysis) {
        if (!codebaseAnalysis) {
            return 'No codebase analysis available.';
        }

        const sections = [];
        
        if (codebaseAnalysis.file_structure) {
            sections.push(`File Structure: ${JSON.stringify(codebaseAnalysis.file_structure, null, 2)}`);
        }
        
        if (codebaseAnalysis.metrics) {
            sections.push(`Metrics: ${JSON.stringify(codebaseAnalysis.metrics, null, 2)}`);
        }

        return sections.join('\n\n') || 'Codebase analysis data available but not formatted.';
    }

    /**
     * Format related tasks for prompt
     * @param {Array} relatedTasks - Related tasks
     * @returns {string} Formatted related tasks
     * @private
     */
    _formatRelatedTasks(relatedTasks) {
        if (!Array.isArray(relatedTasks) || relatedTasks.length === 0) {
            return 'No related tasks found.';
        }

        return relatedTasks
            .map(task => `- ${task.title} (${task.status}): ${task.description}`)
            .join('\n');
    }

    /**
     * Format constraints for prompt
     * @param {Object} constraints - Constraints object
     * @returns {string} Formatted constraints
     * @private
     */
    _formatConstraints(constraints) {
        if (!constraints || Object.keys(constraints).length === 0) {
            return 'No specific constraints.';
        }

        return Object.entries(constraints)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');
    }

    /**
     * Format performance data for prompt
     * @param {Object} performanceData - Performance data
     * @returns {string} Formatted performance data
     * @private
     */
    _formatPerformanceData(performanceData) {
        if (!performanceData || Object.keys(performanceData).length === 0) {
            return 'No performance data available.';
        }

        return Object.entries(performanceData)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');
    }

    /**
     * Truncate context to fit size limits
     * @param {Object} context - Context to truncate
     * @returns {Object} Truncated context
     * @private
     */
    _truncateContext(context) {
        const truncated = { ...context };
        
        // Remove or truncate large fields
        if (truncated.codebase_analysis) {
            delete truncated.codebase_analysis.file_structure;
        }
        
        if (truncated.related_tasks && truncated.related_tasks.length > 5) {
            truncated.related_tasks = truncated.related_tasks.slice(0, 5);
        }

        return truncated;
    }
}

export default DatabasePromptGenerator;

