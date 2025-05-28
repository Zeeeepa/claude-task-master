/**
 * @fileoverview Context Manager
 * @description Unified context management for AI prompt generation and analytics
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Context manager for comprehensive context preservation and retrieval
 */
export class ContextManager {
    constructor(config = {}) {
        this.config = {
            enable_context_caching: config.enable_context_caching !== false,
            enable_advanced_analytics: config.enable_advanced_analytics !== false,
            max_context_size: config.max_context_size || 8000,
            include_code_examples: config.include_code_examples !== false,
            enhance_with_best_practices: config.enhance_with_best_practices !== false,
            cache_ttl: config.cache_ttl || 3600000, // 1 hour
            ...config
        };
        
        this.contextCache = new Map();
        this.workflowContexts = new Map();
        this.analyticsEngine = new ContextAnalyticsEngine(this.config);
        this.promptContextGenerator = new PromptContextGenerator(this.config);
    }

    /**
     * Initialize the context manager
     */
    async initialize() {
        log('debug', 'Initializing context manager...');
        
        await this.analyticsEngine.initialize();
        await this.promptContextGenerator.initialize();
        
        // Start cache cleanup if caching is enabled
        if (this.config.enable_context_caching) {
            this._startCacheCleanup();
        }
        
        log('debug', 'Context manager initialized');
    }

    /**
     * Generate prompt context for task
     * @param {string} taskId - Task identifier
     * @param {Object} options - Context generation options
     * @returns {Promise<Object>} Prompt context
     */
    async generatePromptContext(taskId, options = {}) {
        const cacheKey = `prompt_context_${taskId}`;
        
        // Check cache first
        if (this.config.enable_context_caching && this.contextCache.has(cacheKey)) {
            const cached = this.contextCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.config.cache_ttl) {
                log('debug', `Using cached prompt context for task ${taskId}`);
                return cached.context;
            }
        }
        
        log('debug', `Generating prompt context for task ${taskId}`);
        
        try {
            const context = await this.promptContextGenerator.generateContext(taskId, options);
            
            // Cache the result
            if (this.config.enable_context_caching) {
                this.contextCache.set(cacheKey, {
                    context,
                    timestamp: Date.now()
                });
            }
            
            return context;
            
        } catch (error) {
            log('error', `Failed to generate prompt context for task ${taskId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Store workflow context
     * @param {string} workflowId - Workflow identifier
     * @param {string} step - Workflow step
     * @param {any} data - Step data
     */
    async storeWorkflowContext(workflowId, step, data) {
        if (!this.workflowContexts.has(workflowId)) {
            this.workflowContexts.set(workflowId, {
                workflow_id: workflowId,
                steps: {},
                created_at: new Date(),
                last_updated: new Date()
            });
        }
        
        const context = this.workflowContexts.get(workflowId);
        context.steps[step] = {
            data,
            timestamp: new Date()
        };
        context.last_updated = new Date();
        
        log('debug', `Stored workflow context for ${workflowId}, step: ${step}`);
    }

    /**
     * Get workflow context
     * @param {string} workflowId - Workflow identifier
     * @returns {Promise<Object|null>} Workflow context
     */
    async getWorkflowContext(workflowId) {
        return this.workflowContexts.get(workflowId) || null;
    }

    /**
     * Analyze context patterns
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Context analytics
     */
    async analyzeContextPatterns(taskId) {
        if (!this.config.enable_advanced_analytics) {
            return { analytics_disabled: true };
        }
        
        return await this.analyticsEngine.analyzePatterns(taskId);
    }

    /**
     * Get context health score
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Context health score
     */
    async getContextHealthScore(taskId) {
        return await this.analyticsEngine.calculateHealthScore(taskId);
    }

    /**
     * Export context for prompt
     * @param {string} taskId - Task identifier
     * @param {string} formatType - Export format
     * @returns {Promise<string>} Formatted context
     */
    async exportContextForPrompt(taskId, formatType = 'markdown') {
        const context = await this.generatePromptContext(taskId);
        return this.promptContextGenerator.formatContext(context, formatType);
    }

    /**
     * Clear context cache
     */
    async clearCache() {
        this.contextCache.clear();
        log('debug', 'Context cache cleared');
    }

    /**
     * Get context statistics
     * @returns {Promise<Object>} Context statistics
     */
    async getStatistics() {
        return {
            cached_contexts: this.contextCache.size,
            workflow_contexts: this.workflowContexts.size,
            cache_hit_rate: this._calculateCacheHitRate(),
            analytics_engine_stats: await this.analyticsEngine.getStatistics(),
            prompt_generator_stats: await this.promptContextGenerator.getStatistics()
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = await this.getStatistics();
        
        return {
            status: 'healthy',
            caching_enabled: this.config.enable_context_caching,
            analytics_enabled: this.config.enable_advanced_analytics,
            cached_contexts: stats.cached_contexts,
            workflow_contexts: stats.workflow_contexts,
            analytics_engine: await this.analyticsEngine.getHealth(),
            prompt_generator: await this.promptContextGenerator.getHealth()
        };
    }

    /**
     * Shutdown the context manager
     */
    async shutdown() {
        log('debug', 'Shutting down context manager...');
        
        // Stop cache cleanup
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
        }
        
        await this.analyticsEngine.shutdown();
        await this.promptContextGenerator.shutdown();
        
        // Clear all contexts
        this.contextCache.clear();
        this.workflowContexts.clear();
    }

    // Private methods

    /**
     * Start cache cleanup interval
     * @private
     */
    _startCacheCleanup() {
        this.cacheCleanupInterval = setInterval(() => {
            this._cleanupExpiredCache();
        }, 300000); // Clean every 5 minutes
    }

    /**
     * Cleanup expired cache entries
     * @private
     */
    _cleanupExpiredCache() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, cached] of this.contextCache) {
            if (now - cached.timestamp > this.config.cache_ttl) {
                this.contextCache.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            log('debug', `Cleaned up ${cleanedCount} expired cache entries`);
        }
    }

    /**
     * Calculate cache hit rate
     * @returns {number} Cache hit rate percentage
     * @private
     */
    _calculateCacheHitRate() {
        // Mock implementation - in production, this would track actual hits/misses
        return this.contextCache.size > 0 ? 75 : 0; // Mock 75% hit rate
    }
}

/**
 * Context Analytics Engine
 */
class ContextAnalyticsEngine {
    constructor(config) {
        this.config = config;
        this.patternCache = new Map();
    }

    async initialize() {
        log('debug', 'Initializing context analytics engine...');
    }

    async analyzePatterns(taskId) {
        log('debug', `Analyzing context patterns for task ${taskId}`);
        
        // Mock pattern analysis
        return {
            task_id: taskId,
            complexity_indicators: {
                technical_complexity: Math.floor(Math.random() * 10) + 1,
                integration_complexity: Math.floor(Math.random() * 5) + 1,
                business_complexity: Math.floor(Math.random() * 8) + 1
            },
            interaction_patterns: {
                frequent_technologies: ['javascript', 'react', 'node.js'],
                common_patterns: ['authentication', 'api_integration', 'testing'],
                complexity_trends: 'increasing'
            },
            validation_trends: {
                common_issues: ['test_coverage', 'code_style'],
                success_patterns: ['good_documentation', 'comprehensive_tests'],
                improvement_areas: ['performance_optimization']
            },
            performance_metrics: {
                average_processing_time_ms: 2500,
                context_retrieval_time_ms: 150,
                analysis_accuracy: 0.85
            },
            recommendations: [
                'Consider breaking down complex tasks',
                'Add more specific acceptance criteria',
                'Include performance requirements'
            ]
        };
    }

    async calculateHealthScore(taskId) {
        log('debug', `Calculating context health score for task ${taskId}`);
        
        // Mock health score calculation
        const baseScore = 75 + Math.floor(Math.random() * 20); // 75-95
        
        return {
            task_id: taskId,
            overall_score: baseScore,
            component_scores: {
                context_completeness: baseScore + Math.floor(Math.random() * 10) - 5,
                context_accuracy: baseScore + Math.floor(Math.random() * 10) - 5,
                context_relevance: baseScore + Math.floor(Math.random() * 10) - 5,
                context_freshness: baseScore + Math.floor(Math.random() * 10) - 5
            },
            health_indicators: {
                has_sufficient_context: baseScore > 80,
                context_is_recent: true,
                context_is_complete: baseScore > 75,
                context_is_accurate: baseScore > 70
            },
            improvement_suggestions: baseScore < 80 ? [
                'Add more detailed requirements',
                'Include technical specifications',
                'Provide better acceptance criteria'
            ] : []
        };
    }

    async getStatistics() {
        return {
            patterns_analyzed: this.patternCache.size,
            analysis_accuracy: 0.85,
            average_analysis_time_ms: 150
        };
    }

    async getHealth() {
        return {
            status: 'healthy',
            patterns_cached: this.patternCache.size
        };
    }

    async shutdown() {
        this.patternCache.clear();
    }
}

/**
 * Prompt Context Generator
 */
class PromptContextGenerator {
    constructor(config) {
        this.config = config;
        this.generationStats = {
            contexts_generated: 0,
            average_generation_time_ms: 0,
            cache_hits: 0
        };
    }

    async initialize() {
        log('debug', 'Initializing prompt context generator...');
    }

    async generateContext(taskId, options = {}) {
        const startTime = Date.now();
        
        // Mock context generation
        const context = {
            task_id: taskId,
            task_summary: await this._generateTaskSummary(taskId),
            requirements_context: await this._generateRequirementsContext(taskId),
            codebase_context: await this._generateCodebaseContext(taskId),
            recent_interactions: await this._generateRecentInteractions(taskId),
            validation_history: await this._generateValidationHistory(taskId),
            dependency_context: await this._generateDependencyContext(taskId),
            performance_context: await this._generatePerformanceContext(taskId),
            workflow_state: await this._generateWorkflowState(taskId),
            metadata: {
                generated_at: new Date(),
                generation_time_ms: Date.now() - startTime,
                context_version: '1.0.0',
                options: options
            }
        };
        
        // Update statistics
        this.generationStats.contexts_generated++;
        this.generationStats.average_generation_time_ms = 
            (this.generationStats.average_generation_time_ms + (Date.now() - startTime)) / 2;
        
        return context;
    }

    formatContext(context, formatType) {
        switch (formatType) {
            case 'markdown':
                return this._formatAsMarkdown(context);
            case 'json':
                return JSON.stringify(context, null, 2);
            case 'yaml':
                return this._formatAsYAML(context);
            default:
                return JSON.stringify(context, null, 2);
        }
    }

    async getStatistics() {
        return { ...this.generationStats };
    }

    async getHealth() {
        return {
            status: 'healthy',
            contexts_generated: this.generationStats.contexts_generated
        };
    }

    async shutdown() {
        // Cleanup
    }

    // Private methods for mock context generation

    async _generateTaskSummary(taskId) {
        return {
            id: taskId,
            title: `Mock Task ${taskId}`,
            description: 'Mock task description for context generation',
            status: 'pending',
            priority: 'medium',
            complexity_score: 5,
            affected_files: ['src/main.js', 'tests/main.test.js'],
            tags: ['implementation', 'testing'],
            created_at: new Date(),
            estimated_hours: 4
        };
    }

    async _generateRequirementsContext(taskId) {
        return {
            functional_requirements: [
                'Implement user authentication',
                'Add input validation',
                'Create API endpoints'
            ],
            non_functional_requirements: [
                'Response time < 200ms',
                'Support 1000 concurrent users',
                'Maintain 99.9% uptime'
            ],
            business_requirements: [
                'Improve user experience',
                'Reduce support tickets',
                'Increase conversion rate'
            ],
            technical_constraints: [
                'Use existing database schema',
                'Maintain backward compatibility',
                'Follow security guidelines'
            ]
        };
    }

    async _generateCodebaseContext(taskId) {
        return {
            language: 'JavaScript',
            framework: 'Node.js with Express',
            architecture: 'Microservices',
            coding_standards: [
                'Use ESLint configuration',
                'Follow JSDoc standards',
                'Maintain test coverage > 80%'
            ],
            dependencies: [
                'express@4.18.0',
                'mongoose@6.0.0',
                'jest@28.0.0'
            ],
            file_structure: {
                'src/': 'Main source code',
                'tests/': 'Test files',
                'docs/': 'Documentation',
                'config/': 'Configuration files'
            }
        };
    }

    async _generateRecentInteractions(taskId) {
        return [
            {
                agent_name: 'codegen',
                interaction_type: 'prompt_generation',
                timestamp: new Date(),
                success: true,
                duration_ms: 1500
            },
            {
                agent_name: 'claude_code',
                interaction_type: 'validation',
                timestamp: new Date(),
                success: true,
                duration_ms: 3000
            }
        ];
    }

    async _generateValidationHistory(taskId) {
        return [
            {
                validation_type: 'code_quality',
                validator_name: 'eslint',
                status: 'passed',
                score: 85,
                timestamp: new Date()
            },
            {
                validation_type: 'security',
                validator_name: 'snyk',
                status: 'passed',
                score: 92,
                timestamp: new Date()
            }
        ];
    }

    async _generateDependencyContext(taskId) {
        return {
            has_dependencies: true,
            total_dependencies: 2,
            completed_dependencies: 1,
            pending_dependencies: 1,
            blocked_dependencies: 0,
            dependencies: [
                {
                    id: 'dep_1',
                    title: 'Database schema setup',
                    status: 'completed'
                },
                {
                    id: 'dep_2',
                    title: 'API authentication',
                    status: 'pending'
                }
            ],
            is_ready: false
        };
    }

    async _generatePerformanceContext(taskId) {
        return {
            has_metrics: true,
            total_metrics: 5,
            avg_execution_time: 250,
            recent_metrics: [
                {
                    type: 'execution_time',
                    name: 'api_response_time',
                    value: 180,
                    unit: 'ms',
                    timestamp: new Date()
                }
            ],
            performance_summary: {
                execution_times: 5,
                avg_execution_time_ms: 250
            }
        };
    }

    async _generateWorkflowState(taskId) {
        return {
            current_state: 'in_progress',
            workflow_id: `workflow_${taskId}`,
            started_at: new Date(),
            last_updated: new Date(),
            progress_percentage: 60,
            completed_steps: ['analysis', 'design'],
            pending_steps: ['implementation', 'testing'],
            next_step: 'implementation'
        };
    }

    _formatAsMarkdown(context) {
        return `# Task Context: ${context.task_id}

## Task Summary
- **Title**: ${context.task_summary.title}
- **Status**: ${context.task_summary.status}
- **Priority**: ${context.task_summary.priority}
- **Complexity**: ${context.task_summary.complexity_score}/10

## Requirements
${context.requirements_context.functional_requirements.map(req => `- ${req}`).join('\n')}

## Codebase Context
- **Language**: ${context.codebase_context.language}
- **Framework**: ${context.codebase_context.framework}
- **Architecture**: ${context.codebase_context.architecture}

## Dependencies
${context.dependency_context.dependencies.map(dep => `- ${dep.title} (${dep.status})`).join('\n')}

## Recent Activity
${context.recent_interactions.map(interaction => 
    `- ${interaction.agent_name}: ${interaction.interaction_type} (${interaction.success ? 'success' : 'failed'})`
).join('\n')}
`;
    }

    _formatAsYAML(context) {
        // Mock YAML formatting
        return `task_id: ${context.task_id}
task_summary:
  title: "${context.task_summary.title}"
  status: ${context.task_summary.status}
  priority: ${context.task_summary.priority}
requirements:
${context.requirements_context.functional_requirements.map(req => `  - "${req}"`).join('\n')}
`;
    }
}

export default ContextManager;

