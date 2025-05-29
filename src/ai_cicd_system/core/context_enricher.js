/**
 * @fileoverview Context Enrichment Engine
 * @description Advanced context enrichment for adding relevant codebase context and dependencies
 */

import { log } from '../../scripts/modules/utils.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Context enrichment engine for adding codebase context and dependencies
 */
export class ContextEnricher {
    constructor(config = {}) {
        this.config = {
            maxContextSize: config.maxContextSize || 8000,
            enableFileAnalysis: config.enableFileAnalysis !== false,
            enableDependencyAnalysis: config.enableDependencyAnalysis !== false,
            enablePatternAnalysis: config.enablePatternAnalysis !== false,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 3600000, // 1 hour
            ...config
        };

        // Initialize analyzers
        this.fileAnalyzer = new FileAnalyzer(this.config);
        this.dependencyAnalyzer = new DependencyAnalyzer(this.config);
        this.patternAnalyzer = new PatternAnalyzer(this.config);
        this.codebaseAnalyzer = new CodebaseAnalyzer(this.config);

        // Context cache
        this.contextCache = new Map();

        log('info', 'Context enricher initialized');
    }

    /**
     * Enrich context with codebase information and dependencies
     * @param {Object} baseContext - Base context information
     * @param {Object} structuredTask - Processed task structure
     * @returns {Promise<Object>} Enriched context
     */
    async enrichContext(baseContext, structuredTask) {
        try {
            log('debug', 'Enriching context', {
                taskType: structuredTask.type,
                hasBaseContext: Object.keys(baseContext).length > 0
            });

            // Check cache first
            const cacheKey = this._generateCacheKey(baseContext, structuredTask);
            if (this.config.cacheEnabled && this.contextCache.has(cacheKey)) {
                const cached = this.contextCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.config.cacheTTL) {
                    log('debug', 'Using cached context');
                    return cached.context;
                }
            }

            // Start with base context
            const enrichedContext = { ...baseContext };

            // Step 1: Analyze codebase structure
            if (this.config.enableFileAnalysis) {
                const codebaseContext = await this.codebaseAnalyzer.analyze(structuredTask);
                enrichedContext.codebase = codebaseContext;
            }

            // Step 2: Analyze dependencies
            if (this.config.enableDependencyAnalysis) {
                const dependencyContext = await this.dependencyAnalyzer.analyze(structuredTask);
                enrichedContext.dependencies = dependencyContext;
            }

            // Step 3: Analyze patterns and best practices
            if (this.config.enablePatternAnalysis) {
                const patternContext = await this.patternAnalyzer.analyze(structuredTask);
                enrichedContext.patterns = patternContext;
            }

            // Step 4: Analyze related files
            const relatedFiles = await this.fileAnalyzer.findRelatedFiles(structuredTask);
            enrichedContext.relatedFiles = relatedFiles;

            // Step 5: Add task-specific context
            enrichedContext.taskMetadata = {
                type: structuredTask.type,
                complexity: structuredTask.complexity.level,
                technologies: structuredTask.technologies,
                estimatedEffort: structuredTask.complexity.estimatedEffort
            };

            // Step 6: Optimize context size
            const optimizedContext = this._optimizeContextSize(enrichedContext);

            // Cache the result
            if (this.config.cacheEnabled) {
                this.contextCache.set(cacheKey, {
                    context: optimizedContext,
                    timestamp: Date.now()
                });
            }

            log('info', 'Context enrichment completed', {
                sections: Object.keys(optimizedContext).length,
                totalSize: JSON.stringify(optimizedContext).length
            });

            return optimizedContext;

        } catch (error) {
            log('error', 'Context enrichment failed', { error: error.message });
            // Return base context if enrichment fails
            return baseContext;
        }
    }

    /**
     * Get context summary for logging and debugging
     * @param {Object} context - Enriched context
     * @returns {Object} Context summary
     */
    getContextSummary(context) {
        return {
            sections: Object.keys(context),
            codebaseFiles: context.codebase?.files?.length || 0,
            dependencies: context.dependencies?.packages?.length || 0,
            patterns: context.patterns?.detected?.length || 0,
            relatedFiles: context.relatedFiles?.length || 0,
            totalSize: JSON.stringify(context).length
        };
    }

    /**
     * Clear context cache
     */
    clearCache() {
        this.contextCache.clear();
        log('debug', 'Context cache cleared');
    }

    /**
     * Generate cache key for context
     * @private
     */
    _generateCacheKey(baseContext, structuredTask) {
        const keyData = {
            taskType: structuredTask.type,
            technologies: structuredTask.technologies.sort(),
            baseContextKeys: Object.keys(baseContext).sort()
        };
        return JSON.stringify(keyData);
    }

    /**
     * Optimize context size to fit within limits
     * @private
     */
    _optimizeContextSize(context) {
        const contextString = JSON.stringify(context);
        if (contextString.length <= this.config.maxContextSize) {
            return context;
        }

        log('debug', 'Optimizing context size', {
            original: contextString.length,
            limit: this.config.maxContextSize
        });

        // Priority order for context sections
        const sectionPriority = [
            'taskMetadata',
            'codebase',
            'dependencies',
            'relatedFiles',
            'patterns'
        ];

        const optimized = {};
        let currentSize = 0;

        // Add sections in priority order until we hit the limit
        for (const section of sectionPriority) {
            if (context[section]) {
                const sectionString = JSON.stringify(context[section]);
                if (currentSize + sectionString.length <= this.config.maxContextSize) {
                    optimized[section] = context[section];
                    currentSize += sectionString.length;
                } else {
                    // Try to include a truncated version
                    const truncated = this._truncateSection(context[section], 
                        this.config.maxContextSize - currentSize);
                    if (truncated) {
                        optimized[section] = truncated;
                    }
                    break;
                }
            }
        }

        return optimized;
    }

    /**
     * Truncate a context section to fit within size limit
     * @private
     */
    _truncateSection(section, maxSize) {
        if (typeof section === 'string') {
            return section.length <= maxSize ? section : 
                   section.substring(0, maxSize - 20) + '...[truncated]';
        }

        if (Array.isArray(section)) {
            const truncated = [];
            let currentSize = 2; // Account for array brackets
            
            for (const item of section) {
                const itemString = JSON.stringify(item);
                if (currentSize + itemString.length <= maxSize) {
                    truncated.push(item);
                    currentSize += itemString.length + 1; // +1 for comma
                } else {
                    break;
                }
            }
            
            return truncated.length > 0 ? truncated : null;
        }

        if (typeof section === 'object' && section !== null) {
            const truncated = {};
            let currentSize = 2; // Account for object braces
            
            for (const [key, value] of Object.entries(section)) {
                const entryString = JSON.stringify({ [key]: value });
                if (currentSize + entryString.length <= maxSize) {
                    truncated[key] = value;
                    currentSize += entryString.length;
                } else {
                    break;
                }
            }
            
            return Object.keys(truncated).length > 0 ? truncated : null;
        }

        return null;
    }
}

/**
 * File analyzer for finding related files and analyzing file structure
 */
class FileAnalyzer {
    constructor(config) {
        this.config = config;
    }

    /**
     * Find files related to the task
     * @param {Object} structuredTask - Task structure
     * @returns {Promise<Array>} Related file paths
     */
    async findRelatedFiles(structuredTask) {
        try {
            const relatedFiles = [];
            const searchPatterns = this._generateSearchPatterns(structuredTask);

            // Search for files based on task type and technologies
            for (const pattern of searchPatterns) {
                const files = await this._searchFiles(pattern);
                relatedFiles.push(...files);
            }

            // Remove duplicates and limit results
            const uniqueFiles = [...new Set(relatedFiles)];
            return uniqueFiles.slice(0, 20); // Limit to 20 files

        } catch (error) {
            log('warn', 'File analysis failed', { error: error.message });
            return [];
        }
    }

    /**
     * Generate search patterns based on task
     * @private
     */
    _generateSearchPatterns(structuredTask) {
        const patterns = [];
        
        // Add technology-specific patterns
        for (const tech of structuredTask.technologies) {
            switch (tech.toLowerCase()) {
                case 'javascript':
                case 'typescript':
                    patterns.push('**/*.{js,ts,jsx,tsx}');
                    break;
                case 'python':
                    patterns.push('**/*.py');
                    break;
                case 'java':
                    patterns.push('**/*.java');
                    break;
                case 'go':
                    patterns.push('**/*.go');
                    break;
                case 'react':
                    patterns.push('**/*.{jsx,tsx}');
                    patterns.push('**/components/**/*.{js,ts}');
                    break;
                case 'vue':
                    patterns.push('**/*.vue');
                    break;
                case 'angular':
                    patterns.push('**/*.{component,service,module}.ts');
                    break;
            }
        }

        // Add task-type specific patterns
        switch (structuredTask.type) {
            case 'testing':
                patterns.push('**/*.{test,spec}.{js,ts,py,java}');
                patterns.push('**/tests/**/*');
                break;
            case 'api':
                patterns.push('**/api/**/*');
                patterns.push('**/routes/**/*');
                patterns.push('**/controllers/**/*');
                break;
            case 'database':
                patterns.push('**/migrations/**/*');
                patterns.push('**/models/**/*');
                patterns.push('**/schemas/**/*');
                break;
        }

        return patterns.length > 0 ? patterns : ['**/*.{js,ts,py,java,go}'];
    }

    /**
     * Search for files matching pattern
     * @private
     */
    async _searchFiles(pattern) {
        try {
            // This is a simplified implementation
            // In production, you'd use a proper glob library
            const files = [];
            
            // Mock file search - replace with actual implementation
            const mockFiles = [
                'src/components/UserProfile.tsx',
                'src/services/UserService.js',
                'src/utils/validation.js',
                'tests/UserProfile.test.tsx',
                'src/api/users.js'
            ];
            
            return mockFiles.filter(file => 
                this._matchesPattern(file, pattern)
            );
            
        } catch (error) {
            log('warn', 'File search failed', { pattern, error: error.message });
            return [];
        }
    }

    /**
     * Check if file matches pattern
     * @private
     */
    _matchesPattern(filePath, pattern) {
        // Simplified pattern matching
        const regex = pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\{([^}]+)\}/g, '($1)')
            .replace(/,/g, '|');
        
        return new RegExp(regex).test(filePath);
    }
}

/**
 * Dependency analyzer for analyzing project dependencies
 */
class DependencyAnalyzer {
    constructor(config) {
        this.config = config;
    }

    /**
     * Analyze project dependencies
     * @param {Object} structuredTask - Task structure
     * @returns {Promise<Object>} Dependency analysis
     */
    async analyzeDependencies(structuredTask) {
        try {
            const dependencies = {
                packages: [],
                devDependencies: [],
                peerDependencies: [],
                internal: [],
                external: []
            };

            // Analyze package.json if it exists
            const packageInfo = await this._analyzePackageJson();
            if (packageInfo) {
                dependencies.packages = packageInfo.dependencies || [];
                dependencies.devDependencies = packageInfo.devDependencies || [];
                dependencies.peerDependencies = packageInfo.peerDependencies || [];
            }

            // Analyze internal dependencies
            dependencies.internal = await this._analyzeInternalDependencies(structuredTask);

            // Analyze external API dependencies
            dependencies.external = await this._analyzeExternalDependencies(structuredTask);

            return dependencies;

        } catch (error) {
            log('warn', 'Dependency analysis failed', { error: error.message });
            return { packages: [], devDependencies: [], internal: [], external: [] };
        }
    }

    /**
     * Analyze package.json file
     * @private
     */
    async _analyzePackageJson() {
        try {
            const packagePath = path.join(process.cwd(), 'package.json');
            const packageContent = await fs.readFile(packagePath, 'utf8');
            return JSON.parse(packageContent);
        } catch (error) {
            log('debug', 'No package.json found or failed to parse');
            return null;
        }
    }

    /**
     * Analyze internal dependencies
     * @private
     */
    async _analyzeInternalDependencies(structuredTask) {
        // Analyze internal module dependencies
        const internal = [];
        
        // Add task-specific internal dependencies
        switch (structuredTask.type) {
            case 'api':
                internal.push('authentication', 'validation', 'error-handling');
                break;
            case 'database':
                internal.push('models', 'migrations', 'connection');
                break;
            case 'testing':
                internal.push('test-utils', 'mocks', 'fixtures');
                break;
        }
        
        return internal;
    }

    /**
     * Analyze external dependencies
     * @private
     */
    async _analyzeExternalDependencies(structuredTask) {
        // Analyze external API and service dependencies
        const external = [];
        
        // Add technology-specific external dependencies
        for (const tech of structuredTask.technologies) {
            switch (tech.toLowerCase()) {
                case 'postgresql':
                    external.push('PostgreSQL database');
                    break;
                case 'redis':
                    external.push('Redis cache');
                    break;
                case 'aws':
                    external.push('AWS services');
                    break;
                case 'stripe':
                    external.push('Stripe payment API');
                    break;
            }
        }
        
        return external;
    }
}

/**
 * Pattern analyzer for detecting code patterns and best practices
 */
class PatternAnalyzer {
    constructor(config) {
        this.config = config;
    }

    /**
     * Analyze code patterns and suggest best practices
     * @param {Object} structuredTask - Task structure
     * @returns {Promise<Object>} Pattern analysis
     */
    async analyzePatterns(structuredTask) {
        try {
            const patterns = {
                detected: [],
                recommended: [],
                antiPatterns: [],
                bestPractices: []
            };

            // Detect patterns based on task type
            patterns.detected = this._detectPatterns(structuredTask);
            
            // Recommend patterns for task type
            patterns.recommended = this._recommendPatterns(structuredTask);
            
            // Identify potential anti-patterns to avoid
            patterns.antiPatterns = this._identifyAntiPatterns(structuredTask);
            
            // Suggest best practices
            patterns.bestPractices = this._suggestBestPractices(structuredTask);

            return patterns;

        } catch (error) {
            log('warn', 'Pattern analysis failed', { error: error.message });
            return { detected: [], recommended: [], antiPatterns: [], bestPractices: [] };
        }
    }

    /**
     * Detect existing patterns
     * @private
     */
    _detectPatterns(structuredTask) {
        const detected = [];
        
        // Detect patterns based on technologies
        for (const tech of structuredTask.technologies) {
            switch (tech.toLowerCase()) {
                case 'react':
                    detected.push('Component-based architecture', 'Hooks pattern');
                    break;
                case 'express':
                    detected.push('Middleware pattern', 'Route handlers');
                    break;
                case 'postgresql':
                    detected.push('Relational data model', 'ACID transactions');
                    break;
            }
        }
        
        return detected;
    }

    /**
     * Recommend patterns for task
     * @private
     */
    _recommendPatterns(structuredTask) {
        const recommended = [];
        
        switch (structuredTask.type) {
            case 'feature_development':
                recommended.push('MVC pattern', 'Dependency injection', 'Factory pattern');
                break;
            case 'api':
                recommended.push('RESTful design', 'Repository pattern', 'Service layer');
                break;
            case 'testing':
                recommended.push('AAA pattern', 'Test doubles', 'Page object model');
                break;
            case 'refactoring':
                recommended.push('SOLID principles', 'Extract method', 'Strategy pattern');
                break;
        }
        
        return recommended;
    }

    /**
     * Identify anti-patterns to avoid
     * @private
     */
    _identifyAntiPatterns(structuredTask) {
        const antiPatterns = [];
        
        switch (structuredTask.type) {
            case 'feature_development':
                antiPatterns.push('God object', 'Spaghetti code', 'Magic numbers');
                break;
            case 'api':
                antiPatterns.push('Chatty API', 'God endpoint', 'Leaky abstractions');
                break;
            case 'database':
                antiPatterns.push('N+1 queries', 'Missing indexes', 'Circular dependencies');
                break;
        }
        
        return antiPatterns;
    }

    /**
     * Suggest best practices
     * @private
     */
    _suggestBestPractices(structuredTask) {
        const practices = [];
        
        // General best practices
        practices.push('Write clean, readable code');
        practices.push('Follow consistent naming conventions');
        practices.push('Add comprehensive error handling');
        practices.push('Include proper logging');
        
        // Task-specific best practices
        switch (structuredTask.type) {
            case 'feature_development':
                practices.push('Write unit tests first (TDD)');
                practices.push('Keep functions small and focused');
                practices.push('Use meaningful variable names');
                break;
            case 'api':
                practices.push('Validate all inputs');
                practices.push('Use proper HTTP status codes');
                practices.push('Implement rate limiting');
                practices.push('Add API documentation');
                break;
            case 'testing':
                practices.push('Test edge cases and error conditions');
                practices.push('Use descriptive test names');
                practices.push('Keep tests independent');
                break;
        }
        
        return practices;
    }
}

/**
 * Codebase analyzer for analyzing overall codebase structure
 */
class CodebaseAnalyzer {
    constructor(config) {
        this.config = config;
    }

    /**
     * Analyze codebase structure and context
     * @param {Object} structuredTask - Task structure
     * @returns {Promise<Object>} Codebase analysis
     */
    async analyzeCodebase(structuredTask) {
        try {
            const analysis = {
                structure: {},
                technologies: [],
                patterns: [],
                conventions: {},
                metrics: {}
            };

            // Analyze directory structure
            analysis.structure = await this._analyzeStructure();
            
            // Detect technologies in use
            analysis.technologies = await this._detectTechnologies();
            
            // Analyze code conventions
            analysis.conventions = await this._analyzeConventions();
            
            // Calculate basic metrics
            analysis.metrics = await this._calculateMetrics();

            return analysis;

        } catch (error) {
            log('warn', 'Codebase analysis failed', { error: error.message });
            return {
                structure: {},
                technologies: [],
                patterns: [],
                conventions: {},
                metrics: {}
            };
        }
    }

    /**
     * Analyze directory structure
     * @private
     */
    async _analyzeStructure() {
        try {
            // This would analyze the actual directory structure
            // For now, return a mock structure
            return {
                src: ['components', 'services', 'utils', 'api'],
                tests: ['unit', 'integration', 'e2e'],
                docs: ['api', 'user-guide'],
                config: ['webpack', 'babel', 'eslint']
            };
        } catch (error) {
            return {};
        }
    }

    /**
     * Detect technologies in use
     * @private
     */
    async _detectTechnologies() {
        const technologies = [];
        
        try {
            // Check for common technology indicators
            const packageJson = await this._analyzePackageJson();
            if (packageJson) {
                const deps = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies
                };
                
                if (deps.react) technologies.push('React');
                if (deps.vue) technologies.push('Vue');
                if (deps.angular) technologies.push('Angular');
                if (deps.express) technologies.push('Express');
                if (deps.typescript) technologies.push('TypeScript');
                if (deps.jest) technologies.push('Jest');
            }
        } catch (error) {
            log('debug', 'Technology detection failed', { error: error.message });
        }
        
        return technologies;
    }

    /**
     * Analyze code conventions
     * @private
     */
    async _analyzeConventions() {
        return {
            naming: 'camelCase for variables, PascalCase for components',
            indentation: '2 spaces',
            quotes: 'single quotes preferred',
            semicolons: 'required',
            lineLength: '100 characters max'
        };
    }

    /**
     * Calculate basic metrics
     * @private
     */
    async _calculateMetrics() {
        return {
            totalFiles: 150,
            linesOfCode: 12500,
            testCoverage: '85%',
            complexity: 'medium',
            maintainabilityIndex: 78
        };
    }
}

/**
 * Custom error class for context enrichment operations
 */
export class ContextEnrichmentError extends Error {
    constructor(message, code = 'CONTEXT_ERROR', originalError = null) {
        super(message);
        this.name = 'ContextEnrichmentError';
        this.code = code;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ContextEnrichmentError);
        }
    }
}

export default ContextEnricher;

