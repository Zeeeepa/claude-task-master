/**
 * @fileoverview Context Enricher
 * @description Enhances prompts with codebase analysis, dependencies, and contextual information
 *              to improve the quality and accuracy of generated code
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Context enricher for intelligent prompt enhancement
 */
export class ContextEnricher {
    constructor(config = {}) {
        this.config = {
            max_context_size: config.max_context_size || 50000,
            analysis_depth: config.analysis_depth || 'medium', // shallow, medium, deep
            cache_enabled: config.cache_enabled !== false,
            cache_ttl: config.cache_ttl || 1800000, // 30 minutes
            file_analysis: {
                enabled: config.file_analysis?.enabled !== false,
                max_files: config.file_analysis?.max_files || 20,
                max_file_size: config.file_analysis?.max_file_size || 100000, // 100KB
                supported_extensions: config.file_analysis?.supported_extensions || [
                    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php'
                ]
            },
            dependency_analysis: {
                enabled: config.dependency_analysis?.enabled !== false,
                package_files: config.dependency_analysis?.package_files || [
                    'package.json', 'requirements.txt', 'pom.xml', 'Cargo.toml', 'go.mod', 'composer.json'
                ]
            },
            git_analysis: {
                enabled: config.git_analysis?.enabled !== false,
                max_commits: config.git_analysis?.max_commits || 10,
                max_branches: config.git_analysis?.max_branches || 5
            },
            ...config
        };

        // Caching
        this.contextCache = new Map();
        this.analysisCache = new Map();
        this.fileCache = new Map();

        // Statistics
        this.statistics = {
            enrichments_performed: 0,
            cache_hits: 0,
            cache_misses: 0,
            avg_enrichment_time: 0,
            context_size_distribution: new Map()
        };

        log('info', 'Context Enricher initialized');
    }

    /**
     * Initialize context enricher
     */
    async initialize() {
        log('info', 'Initializing Context Enricher...');

        // Start cache cleanup interval
        this._startCacheCleanup();

        log('info', 'Context Enricher initialized successfully');
    }

    /**
     * Enrich context with codebase analysis and additional information
     * @param {Object} context - Base context
     * @param {Object} task - Task object
     * @returns {Promise<Object>} Enriched context
     */
    async enrichContext(context, task) {
        const startTime = Date.now();
        const cacheKey = this._generateCacheKey(context, task);

        log('debug', `Enriching context for task ${task.id}`);

        // Check cache first
        if (this.config.cache_enabled && this.contextCache.has(cacheKey)) {
            this.statistics.cache_hits++;
            const cached = this.contextCache.get(cacheKey);
            
            if (Date.now() - cached.timestamp < this.config.cache_ttl) {
                log('debug', `Using cached enriched context for task ${task.id}`);
                return cached.context;
            } else {
                this.contextCache.delete(cacheKey);
            }
        }

        this.statistics.cache_misses++;

        try {
            // Start with base context
            const enrichedContext = { ...context };

            // Step 1: File system analysis
            if (this.config.file_analysis.enabled) {
                const fileAnalysis = await this._analyzeFileSystem(task);
                enrichedContext.file_analysis = fileAnalysis;
            }

            // Step 2: Dependency analysis
            if (this.config.dependency_analysis.enabled) {
                const dependencyAnalysis = await this._analyzeDependencies(task);
                enrichedContext.dependency_analysis = dependencyAnalysis;
            }

            // Step 3: Git repository analysis
            if (this.config.git_analysis.enabled) {
                const gitAnalysis = await this._analyzeGitRepository(task);
                enrichedContext.git_analysis = gitAnalysis;
            }

            // Step 4: Code pattern analysis
            const patternAnalysis = await this._analyzeCodePatterns(task, enrichedContext);
            enrichedContext.pattern_analysis = patternAnalysis;

            // Step 5: Related code analysis
            const relatedCodeAnalysis = await this._analyzeRelatedCode(task, enrichedContext);
            enrichedContext.related_code = relatedCodeAnalysis;

            // Step 6: Performance and security considerations
            const performanceAnalysis = await this._analyzePerformanceConsiderations(task, enrichedContext);
            enrichedContext.performance_considerations = performanceAnalysis;

            const securityAnalysis = await this._analyzeSecurityConsiderations(task, enrichedContext);
            enrichedContext.security_considerations = securityAnalysis;

            // Step 7: Testing context
            const testingContext = await this._analyzeTestingContext(task, enrichedContext);
            enrichedContext.testing_context = testingContext;

            // Step 8: Ensure context size limits
            const finalContext = await this._enforceContextLimits(enrichedContext);

            // Cache the result
            if (this.config.cache_enabled) {
                this.contextCache.set(cacheKey, {
                    context: finalContext,
                    timestamp: Date.now()
                });
            }

            // Update statistics
            const enrichmentTime = Date.now() - startTime;
            this._updateStatistics(enrichmentTime, finalContext);

            log('debug', `Context enriched for task ${task.id} (${enrichmentTime}ms)`);
            return finalContext;

        } catch (error) {
            log('error', `Failed to enrich context for task ${task.id}: ${error.message}`);
            return context; // Return original context on error
        }
    }

    /**
     * Get enrichment statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return {
            ...this.statistics,
            cache_hit_rate: this.statistics.cache_hits / (this.statistics.cache_hits + this.statistics.cache_misses) || 0,
            cache_size: this.contextCache.size,
            analysis_cache_size: this.analysisCache.size
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        
        return {
            status: 'healthy',
            cache_hit_rate: stats.cache_hit_rate,
            avg_enrichment_time_ms: stats.avg_enrichment_time,
            enrichments_performed: stats.enrichments_performed,
            file_analysis_enabled: this.config.file_analysis.enabled,
            dependency_analysis_enabled: this.config.dependency_analysis.enabled,
            git_analysis_enabled: this.config.git_analysis.enabled
        };
    }

    /**
     * Shutdown context enricher
     */
    async shutdown() {
        log('info', 'Shutting down Context Enricher...');

        // Clear all caches
        this.contextCache.clear();
        this.analysisCache.clear();
        this.fileCache.clear();

        log('info', 'Context Enricher shut down');
    }

    // Private methods

    /**
     * Analyze file system for relevant files and structure
     * @param {Object} task - Task object
     * @returns {Promise<Object>} File analysis
     * @private
     */
    async _analyzeFileSystem(task) {
        const cacheKey = `file_analysis_${task.project_id || 'default'}`;
        
        // Check analysis cache
        if (this.analysisCache.has(cacheKey)) {
            const cached = this.analysisCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.config.cache_ttl) {
                return cached.analysis;
            }
        }

        try {
            const analysis = {
                project_structure: await this._analyzeProjectStructure(),
                relevant_files: await this._findRelevantFiles(task),
                file_patterns: await this._analyzeFilePatterns(),
                code_metrics: await this._calculateCodeMetrics()
            };

            // Cache the analysis
            this.analysisCache.set(cacheKey, {
                analysis,
                timestamp: Date.now()
            });

            return analysis;

        } catch (error) {
            log('warning', `File system analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Analyze project dependencies
     * @param {Object} task - Task object
     * @returns {Promise<Object>} Dependency analysis
     * @private
     */
    async _analyzeDependencies(task) {
        try {
            const dependencies = {
                package_dependencies: await this._analyzePackageDependencies(),
                internal_dependencies: await this._analyzeInternalDependencies(task),
                version_conflicts: await this._detectVersionConflicts(),
                security_vulnerabilities: await this._checkSecurityVulnerabilities()
            };

            return dependencies;

        } catch (error) {
            log('warning', `Dependency analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Analyze Git repository information
     * @param {Object} task - Task object
     * @returns {Promise<Object>} Git analysis
     * @private
     */
    async _analyzeGitRepository(task) {
        try {
            const gitInfo = {
                recent_commits: await this._getRecentCommits(),
                active_branches: await this._getActiveBranches(),
                file_history: await this._getFileHistory(task),
                contributors: await this._getContributors(),
                commit_patterns: await this._analyzeCommitPatterns()
            };

            return gitInfo;

        } catch (error) {
            log('warning', `Git analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Analyze code patterns and conventions
     * @param {Object} task - Task object
     * @param {Object} context - Current context
     * @returns {Promise<Object>} Pattern analysis
     * @private
     */
    async _analyzeCodePatterns(task, context) {
        try {
            const patterns = {
                coding_style: await this._analyzeCodingStyle(),
                architecture_patterns: await this._analyzeArchitecturePatterns(),
                naming_conventions: await this._analyzeNamingConventions(),
                design_patterns: await this._analyzeDesignPatterns(),
                error_handling_patterns: await this._analyzeErrorHandlingPatterns()
            };

            return patterns;

        } catch (error) {
            log('warning', `Pattern analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Analyze related code and similar implementations
     * @param {Object} task - Task object
     * @param {Object} context - Current context
     * @returns {Promise<Object>} Related code analysis
     * @private
     */
    async _analyzeRelatedCode(task, context) {
        try {
            const relatedCode = {
                similar_functions: await this._findSimilarFunctions(task),
                related_modules: await this._findRelatedModules(task),
                usage_examples: await this._findUsageExamples(task),
                test_examples: await this._findTestExamples(task)
            };

            return relatedCode;

        } catch (error) {
            log('warning', `Related code analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Analyze performance considerations
     * @param {Object} task - Task object
     * @param {Object} context - Current context
     * @returns {Promise<Object>} Performance analysis
     * @private
     */
    async _analyzePerformanceConsiderations(task, context) {
        try {
            const performance = {
                bottlenecks: await this._identifyPotentialBottlenecks(task),
                optimization_opportunities: await this._findOptimizationOpportunities(task),
                scalability_concerns: await this._analyzeScalabilityConcerns(task),
                memory_considerations: await this._analyzeMemoryConsiderations(task),
                caching_strategies: await this._suggestCachingStrategies(task)
            };

            return performance;

        } catch (error) {
            log('warning', `Performance analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Analyze security considerations
     * @param {Object} task - Task object
     * @param {Object} context - Current context
     * @returns {Promise<Object>} Security analysis
     * @private
     */
    async _analyzeSecurityConsiderations(task, context) {
        try {
            const security = {
                vulnerability_risks: await this._identifyVulnerabilityRisks(task),
                input_validation: await this._analyzeInputValidationNeeds(task),
                authentication_requirements: await this._analyzeAuthenticationNeeds(task),
                data_protection: await this._analyzeDataProtectionNeeds(task),
                security_best_practices: await this._getSecurityBestPractices(task)
            };

            return security;

        } catch (error) {
            log('warning', `Security analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Analyze testing context and requirements
     * @param {Object} task - Task object
     * @param {Object} context - Current context
     * @returns {Promise<Object>} Testing context
     * @private
     */
    async _analyzeTestingContext(task, context) {
        try {
            const testing = {
                existing_tests: await this._findExistingTests(task),
                test_patterns: await this._analyzeTestPatterns(),
                coverage_gaps: await this._identifyCoverageGaps(task),
                test_strategies: await this._suggestTestStrategies(task),
                mock_requirements: await this._analyzeMockRequirements(task)
            };

            return testing;

        } catch (error) {
            log('warning', `Testing analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Enforce context size limits
     * @param {Object} context - Context to limit
     * @returns {Promise<Object>} Limited context
     * @private
     */
    async _enforceContextLimits(context) {
        const contextString = JSON.stringify(context);
        
        if (contextString.length <= this.config.max_context_size) {
            return context;
        }

        log('warning', `Context size (${contextString.length}) exceeds limit, truncating`);

        // Prioritize context sections by importance
        const prioritizedContext = {
            // High priority
            file_analysis: context.file_analysis,
            dependency_analysis: context.dependency_analysis,
            pattern_analysis: context.pattern_analysis,
            
            // Medium priority
            related_code: this._truncateSection(context.related_code, 0.3),
            performance_considerations: this._truncateSection(context.performance_considerations, 0.3),
            security_considerations: this._truncateSection(context.security_considerations, 0.3),
            
            // Low priority (truncate more aggressively)
            git_analysis: this._truncateSection(context.git_analysis, 0.2),
            testing_context: this._truncateSection(context.testing_context, 0.2)
        };

        return prioritizedContext;
    }

    /**
     * Generate cache key for context
     * @param {Object} context - Context object
     * @param {Object} task - Task object
     * @returns {string} Cache key
     * @private
     */
    _generateCacheKey(context, task) {
        const keyData = {
            task_id: task.id,
            task_type: task.type,
            project_id: task.project_id,
            context_hash: this._hashObject(context)
        };
        
        return `context_${this._hashObject(keyData)}`;
    }

    /**
     * Hash object for caching
     * @param {Object} obj - Object to hash
     * @returns {string} Hash string
     * @private
     */
    _hashObject(obj) {
        const crypto = require('crypto');
        const content = JSON.stringify(obj, Object.keys(obj).sort());
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }

    /**
     * Update statistics
     * @param {number} enrichmentTime - Time taken for enrichment
     * @param {Object} context - Enriched context
     * @private
     */
    _updateStatistics(enrichmentTime, context) {
        this.statistics.enrichments_performed++;
        this.statistics.avg_enrichment_time = 
            (this.statistics.avg_enrichment_time * (this.statistics.enrichments_performed - 1) + enrichmentTime) / 
            this.statistics.enrichments_performed;

        // Track context size distribution
        const contextSize = JSON.stringify(context).length;
        const sizeCategory = this._categorizeContextSize(contextSize);
        this.statistics.context_size_distribution.set(sizeCategory, 
            (this.statistics.context_size_distribution.get(sizeCategory) || 0) + 1);
    }

    /**
     * Categorize context size
     * @param {number} size - Context size in bytes
     * @returns {string} Size category
     * @private
     */
    _categorizeContextSize(size) {
        if (size < 10000) return 'small';
        if (size < 30000) return 'medium';
        if (size < 50000) return 'large';
        return 'extra_large';
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
                if (now - entry.timestamp > this.config.cache_ttl) {
                    this.contextCache.delete(key);
                }
            }

            // Clean analysis cache
            for (const [key, entry] of this.analysisCache.entries()) {
                if (now - entry.timestamp > this.config.cache_ttl) {
                    this.analysisCache.delete(key);
                }
            }

            // Clean file cache
            for (const [key, entry] of this.fileCache.entries()) {
                if (now - entry.timestamp > this.config.cache_ttl) {
                    this.fileCache.delete(key);
                }
            }

        }, 300000); // Every 5 minutes
    }

    /**
     * Truncate section to fit size constraints
     * @param {Object} section - Section to truncate
     * @param {number} ratio - Ratio to keep (0-1)
     * @returns {Object} Truncated section
     * @private
     */
    _truncateSection(section, ratio) {
        if (!section || typeof section !== 'object') {
            return section;
        }

        const truncated = {};
        const entries = Object.entries(section);
        const keepCount = Math.ceil(entries.length * ratio);

        for (let i = 0; i < keepCount && i < entries.length; i++) {
            const [key, value] = entries[i];
            truncated[key] = value;
        }

        if (keepCount < entries.length) {
            truncated._truncated = `${entries.length - keepCount} items truncated`;
        }

        return truncated;
    }

    // Placeholder methods for actual analysis implementations
    // These would be implemented based on specific project needs

    async _analyzeProjectStructure() {
        return { structure: 'Project structure analysis placeholder' };
    }

    async _findRelevantFiles(task) {
        return { files: [] };
    }

    async _analyzeFilePatterns() {
        return { patterns: [] };
    }

    async _calculateCodeMetrics() {
        return { metrics: {} };
    }

    async _analyzePackageDependencies() {
        return { dependencies: [] };
    }

    async _analyzeInternalDependencies(task) {
        return { internal: [] };
    }

    async _detectVersionConflicts() {
        return { conflicts: [] };
    }

    async _checkSecurityVulnerabilities() {
        return { vulnerabilities: [] };
    }

    async _getRecentCommits() {
        return { commits: [] };
    }

    async _getActiveBranches() {
        return { branches: [] };
    }

    async _getFileHistory(task) {
        return { history: [] };
    }

    async _getContributors() {
        return { contributors: [] };
    }

    async _analyzeCommitPatterns() {
        return { patterns: [] };
    }

    async _analyzeCodingStyle() {
        return { style: {} };
    }

    async _analyzeArchitecturePatterns() {
        return { patterns: [] };
    }

    async _analyzeNamingConventions() {
        return { conventions: [] };
    }

    async _analyzeDesignPatterns() {
        return { patterns: [] };
    }

    async _analyzeErrorHandlingPatterns() {
        return { patterns: [] };
    }

    async _findSimilarFunctions(task) {
        return { functions: [] };
    }

    async _findRelatedModules(task) {
        return { modules: [] };
    }

    async _findUsageExamples(task) {
        return { examples: [] };
    }

    async _findTestExamples(task) {
        return { tests: [] };
    }

    async _identifyPotentialBottlenecks(task) {
        return { bottlenecks: [] };
    }

    async _findOptimizationOpportunities(task) {
        return { opportunities: [] };
    }

    async _analyzeScalabilityConcerns(task) {
        return { concerns: [] };
    }

    async _analyzeMemoryConsiderations(task) {
        return { considerations: [] };
    }

    async _suggestCachingStrategies(task) {
        return { strategies: [] };
    }

    async _identifyVulnerabilityRisks(task) {
        return { risks: [] };
    }

    async _analyzeInputValidationNeeds(task) {
        return { validation: [] };
    }

    async _analyzeAuthenticationNeeds(task) {
        return { authentication: [] };
    }

    async _analyzeDataProtectionNeeds(task) {
        return { protection: [] };
    }

    async _getSecurityBestPractices(task) {
        return { practices: [] };
    }

    async _findExistingTests(task) {
        return { tests: [] };
    }

    async _analyzeTestPatterns() {
        return { patterns: [] };
    }

    async _identifyCoverageGaps(task) {
        return { gaps: [] };
    }

    async _suggestTestStrategies(task) {
        return { strategies: [] };
    }

    async _analyzeMockRequirements(task) {
        return { mocks: [] };
    }
}

export default ContextEnricher;

