/**
 * @fileoverview Context Analyzer
 * @description Analyzes project context, codebase structure, existing patterns,
 * and provides contextual insights for requirement processing.
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Context Analyzer for project and codebase analysis
 */
export class ContextAnalyzer {
    constructor() {
        this.isInitialized = false;
        this.contextCache = new Map();
        this.analysisPatterns = this._initializeAnalysisPatterns();
        
        log('debug', 'Context Analyzer created');
    }

    /**
     * Initialize the context analyzer
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing Context Analyzer...');
        
        try {
            // Initialize context analysis components
            this.isInitialized = true;
            log('info', 'Context Analyzer initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Context Analyzer:', error);
            throw error;
        }
    }

    /**
     * Analyze project context
     * @param {Object} projectContext - Project context information
     * @returns {Promise<Object>} Context analysis results
     */
    async analyze(projectContext) {
        this._ensureInitialized();
        
        log('debug', 'Analyzing project context', {
            hasProjectId: !!projectContext.projectId,
            hasCodebase: !!projectContext.codebase,
            hasRepository: !!projectContext.repository
        });

        try {
            const analysis = {
                project: await this.analyzeProjectStructure(projectContext),
                codebase: await this.analyzeCodebasePatterns(projectContext),
                technology: await this.analyzeTechnologyStack(projectContext),
                architecture: await this.analyzeArchitecture(projectContext),
                dependencies: await this.analyzeDependencies(projectContext),
                patterns: await this.identifyPatterns(projectContext),
                constraints: await this.identifyConstraints(projectContext),
                recommendations: await this.generateRecommendations(projectContext)
            };

            // Cache the analysis
            if (projectContext.projectId) {
                this.contextCache.set(projectContext.projectId, {
                    analysis,
                    timestamp: Date.now()
                });
            }

            log('debug', 'Context analysis completed', {
                projectType: analysis.project.type,
                techStack: analysis.technology.primary,
                architectureStyle: analysis.architecture.style,
                patternsFound: analysis.patterns.length
            });

            return analysis;
        } catch (error) {
            log('error', 'Failed to analyze context:', error);
            throw error;
        }
    }

    /**
     * Analyze project structure
     * @param {Object} projectContext - Project context
     * @returns {Promise<Object>} Project structure analysis
     */
    async analyzeProjectStructure(projectContext) {
        try {
            const structure = {
                type: 'unknown',
                size: 'medium',
                maturity: 'developing',
                domain: 'general',
                characteristics: []
            };

            // Analyze based on available information
            if (projectContext.repository) {
                structure.type = this._inferProjectType(projectContext.repository);
                structure.size = this._estimateProjectSize(projectContext.repository);
                structure.maturity = this._assessProjectMaturity(projectContext.repository);
            }

            if (projectContext.description) {
                structure.domain = this._identifyDomain(projectContext.description);
                structure.characteristics = this._extractCharacteristics(projectContext.description);
            }

            // Add metadata
            structure.metadata = {
                analyzedAt: new Date(),
                confidence: this._calculateConfidence(structure),
                sources: Object.keys(projectContext)
            };

            return structure;
        } catch (error) {
            log('error', 'Failed to analyze project structure:', error);
            return { type: 'unknown', size: 'medium', maturity: 'developing', domain: 'general' };
        }
    }

    /**
     * Analyze codebase patterns
     * @param {Object} projectContext - Project context
     * @returns {Promise<Object>} Codebase patterns analysis
     */
    async analyzeCodebasePatterns(projectContext) {
        try {
            const patterns = {
                architectural: [],
                design: [],
                coding: [],
                testing: [],
                deployment: []
            };

            // Analyze file structure patterns
            if (projectContext.fileStructure) {
                patterns.architectural = this._identifyArchitecturalPatterns(projectContext.fileStructure);
                patterns.design = this._identifyDesignPatterns(projectContext.fileStructure);
            }

            // Analyze code patterns
            if (projectContext.codebase) {
                patterns.coding = this._identifyCodingPatterns(projectContext.codebase);
                patterns.testing = this._identifyTestingPatterns(projectContext.codebase);
            }

            // Analyze deployment patterns
            if (projectContext.deployment) {
                patterns.deployment = this._identifyDeploymentPatterns(projectContext.deployment);
            }

            return patterns;
        } catch (error) {
            log('error', 'Failed to analyze codebase patterns:', error);
            return { architectural: [], design: [], coding: [], testing: [], deployment: [] };
        }
    }

    /**
     * Analyze technology stack
     * @param {Object} projectContext - Project context
     * @returns {Promise<Object>} Technology stack analysis
     */
    async analyzeTechnologyStack(projectContext) {
        try {
            const techStack = {
                primary: [],
                secondary: [],
                frameworks: [],
                libraries: [],
                tools: [],
                databases: [],
                cloud: [],
                compatibility: 'good'
            };

            // Extract from package.json or similar
            if (projectContext.dependencies) {
                techStack.primary = this._extractPrimaryTechnologies(projectContext.dependencies);
                techStack.frameworks = this._extractFrameworks(projectContext.dependencies);
                techStack.libraries = this._extractLibraries(projectContext.dependencies);
            }

            // Extract from file extensions
            if (projectContext.fileTypes) {
                const languages = this._inferLanguagesFromFiles(projectContext.fileTypes);
                techStack.primary.push(...languages);
            }

            // Extract from configuration files
            if (projectContext.configFiles) {
                techStack.tools = this._extractToolsFromConfig(projectContext.configFiles);
                techStack.databases = this._extractDatabasesFromConfig(projectContext.configFiles);
                techStack.cloud = this._extractCloudFromConfig(projectContext.configFiles);
            }

            // Assess compatibility
            techStack.compatibility = this._assessTechCompatibility(techStack);

            // Remove duplicates and normalize
            techStack.primary = [...new Set(techStack.primary)];
            techStack.frameworks = [...new Set(techStack.frameworks)];
            techStack.libraries = [...new Set(techStack.libraries)];

            return techStack;
        } catch (error) {
            log('error', 'Failed to analyze technology stack:', error);
            return { primary: [], secondary: [], frameworks: [], libraries: [], tools: [] };
        }
    }

    /**
     * Analyze architecture
     * @param {Object} projectContext - Project context
     * @returns {Promise<Object>} Architecture analysis
     */
    async analyzeArchitecture(projectContext) {
        try {
            const architecture = {
                style: 'unknown',
                patterns: [],
                layers: [],
                components: [],
                dataFlow: 'unknown',
                scalability: 'medium',
                maintainability: 'medium'
            };

            // Infer architecture style
            if (projectContext.fileStructure) {
                architecture.style = this._inferArchitectureStyle(projectContext.fileStructure);
                architecture.layers = this._identifyLayers(projectContext.fileStructure);
                architecture.components = this._identifyComponents(projectContext.fileStructure);
            }

            // Analyze data flow
            if (projectContext.codebase) {
                architecture.dataFlow = this._analyzeDataFlow(projectContext.codebase);
            }

            // Assess quality attributes
            architecture.scalability = this._assessScalability(projectContext);
            architecture.maintainability = this._assessMaintainability(projectContext);

            return architecture;
        } catch (error) {
            log('error', 'Failed to analyze architecture:', error);
            return { style: 'unknown', patterns: [], layers: [], components: [] };
        }
    }

    /**
     * Analyze dependencies
     * @param {Object} projectContext - Project context
     * @returns {Promise<Object>} Dependencies analysis
     */
    async analyzeDependencies(projectContext) {
        try {
            const dependencies = {
                external: [],
                internal: [],
                circular: [],
                outdated: [],
                security: [],
                complexity: 'medium'
            };

            if (projectContext.dependencies) {
                dependencies.external = this._analyzeExternalDependencies(projectContext.dependencies);
                dependencies.outdated = this._identifyOutdatedDependencies(projectContext.dependencies);
                dependencies.security = this._identifySecurityIssues(projectContext.dependencies);
            }

            if (projectContext.codebase) {
                dependencies.internal = this._analyzeInternalDependencies(projectContext.codebase);
                dependencies.circular = this._identifyCircularDependencies(projectContext.codebase);
            }

            dependencies.complexity = this._assessDependencyComplexity(dependencies);

            return dependencies;
        } catch (error) {
            log('error', 'Failed to analyze dependencies:', error);
            return { external: [], internal: [], circular: [], complexity: 'medium' };
        }
    }

    /**
     * Identify patterns in the project
     * @param {Object} projectContext - Project context
     * @returns {Promise<Array>} Identified patterns
     */
    async identifyPatterns(projectContext) {
        try {
            const patterns = [];

            // Check for common patterns
            for (const [patternName, patternDef] of Object.entries(this.analysisPatterns)) {
                if (this._matchesPattern(projectContext, patternDef)) {
                    patterns.push({
                        name: patternName,
                        confidence: this._calculatePatternConfidence(projectContext, patternDef),
                        description: patternDef.description,
                        implications: patternDef.implications
                    });
                }
            }

            return patterns.sort((a, b) => b.confidence - a.confidence);
        } catch (error) {
            log('error', 'Failed to identify patterns:', error);
            return [];
        }
    }

    /**
     * Identify constraints
     * @param {Object} projectContext - Project context
     * @returns {Promise<Array>} Identified constraints
     */
    async identifyConstraints(projectContext) {
        try {
            const constraints = [];

            // Technology constraints
            if (projectContext.dependencies) {
                const techConstraints = this._identifyTechnologyConstraints(projectContext.dependencies);
                constraints.push(...techConstraints);
            }

            // Architecture constraints
            if (projectContext.fileStructure) {
                const archConstraints = this._identifyArchitectureConstraints(projectContext.fileStructure);
                constraints.push(...archConstraints);
            }

            // Performance constraints
            const perfConstraints = this._identifyPerformanceConstraints(projectContext);
            constraints.push(...perfConstraints);

            // Security constraints
            const secConstraints = this._identifySecurityConstraints(projectContext);
            constraints.push(...secConstraints);

            return constraints;
        } catch (error) {
            log('error', 'Failed to identify constraints:', error);
            return [];
        }
    }

    /**
     * Generate recommendations
     * @param {Object} projectContext - Project context
     * @returns {Promise<Array>} Generated recommendations
     */
    async generateRecommendations(projectContext) {
        try {
            const recommendations = [];

            // Technology recommendations
            const techRecommendations = this._generateTechnologyRecommendations(projectContext);
            recommendations.push(...techRecommendations);

            // Architecture recommendations
            const archRecommendations = this._generateArchitectureRecommendations(projectContext);
            recommendations.push(...archRecommendations);

            // Best practices recommendations
            const bestPracticesRecommendations = this._generateBestPracticesRecommendations(projectContext);
            recommendations.push(...bestPracticesRecommendations);

            return recommendations.slice(0, 10); // Limit to top 10
        } catch (error) {
            log('error', 'Failed to generate recommendations:', error);
            return [];
        }
    }

    /**
     * Infer project type from repository information
     * @param {Object} repository - Repository information
     * @returns {string} Project type
     * @private
     */
    _inferProjectType(repository) {
        const indicators = {
            'web-application': ['src/components', 'public', 'package.json', 'index.html'],
            'api-service': ['src/routes', 'src/controllers', 'src/models', 'api'],
            'library': ['lib', 'dist', 'index.js', 'package.json'],
            'mobile-app': ['android', 'ios', 'src/screens', 'App.js'],
            'desktop-app': ['src/main', 'electron', 'src/renderer'],
            'cli-tool': ['bin', 'cli.js', 'commands'],
            'microservice': ['Dockerfile', 'kubernetes', 'src/services']
        };

        const files = repository.files || [];
        let bestMatch = 'unknown';
        let maxScore = 0;

        for (const [type, patterns] of Object.entries(indicators)) {
            const score = patterns.filter(pattern => 
                files.some(file => file.includes(pattern))
            ).length;
            
            if (score > maxScore) {
                maxScore = score;
                bestMatch = type;
            }
        }

        return bestMatch;
    }

    /**
     * Estimate project size
     * @param {Object} repository - Repository information
     * @returns {string} Project size
     * @private
     */
    _estimateProjectSize(repository) {
        const fileCount = repository.files?.length || 0;
        const lineCount = repository.lineCount || 0;

        if (fileCount < 20 || lineCount < 1000) return 'small';
        if (fileCount < 100 || lineCount < 10000) return 'medium';
        if (fileCount < 500 || lineCount < 50000) return 'large';
        return 'very-large';
    }

    /**
     * Assess project maturity
     * @param {Object} repository - Repository information
     * @returns {string} Project maturity
     * @private
     */
    _assessProjectMaturity(repository) {
        const indicators = {
            'early': ['TODO', 'FIXME', 'WIP', 'prototype'],
            'developing': ['test', 'spec', 'README', 'documentation'],
            'mature': ['CHANGELOG', 'LICENSE', 'CI', 'production'],
            'legacy': ['deprecated', 'legacy', 'old', 'archive']
        };

        const files = repository.files || [];
        const content = repository.content || '';

        for (const [maturity, patterns] of Object.entries(indicators)) {
            const matches = patterns.filter(pattern => 
                files.some(file => file.toLowerCase().includes(pattern.toLowerCase())) ||
                content.toLowerCase().includes(pattern.toLowerCase())
            ).length;
            
            if (matches >= 2) return maturity;
        }

        return 'developing';
    }

    /**
     * Identify domain from description
     * @param {string} description - Project description
     * @returns {string} Domain
     * @private
     */
    _identifyDomain(description) {
        const domains = {
            'e-commerce': ['shop', 'store', 'cart', 'payment', 'product', 'order'],
            'social': ['social', 'chat', 'message', 'friend', 'post', 'feed'],
            'finance': ['bank', 'finance', 'money', 'transaction', 'payment', 'invoice'],
            'healthcare': ['health', 'medical', 'patient', 'doctor', 'hospital'],
            'education': ['education', 'learning', 'course', 'student', 'teacher'],
            'gaming': ['game', 'player', 'score', 'level', 'achievement'],
            'productivity': ['task', 'project', 'todo', 'calendar', 'note'],
            'media': ['video', 'audio', 'image', 'media', 'streaming']
        };

        const descLower = description.toLowerCase();
        
        for (const [domain, keywords] of Object.entries(domains)) {
            if (keywords.some(keyword => descLower.includes(keyword))) {
                return domain;
            }
        }

        return 'general';
    }

    /**
     * Initialize analysis patterns
     * @returns {Object} Analysis patterns
     * @private
     */
    _initializeAnalysisPatterns() {
        return {
            'mvc': {
                description: 'Model-View-Controller pattern',
                indicators: ['models', 'views', 'controllers'],
                implications: ['Separation of concerns', 'Testability', 'Maintainability']
            },
            'microservices': {
                description: 'Microservices architecture',
                indicators: ['services', 'docker', 'kubernetes', 'api-gateway'],
                implications: ['Scalability', 'Distributed complexity', 'Service boundaries']
            },
            'spa': {
                description: 'Single Page Application',
                indicators: ['react', 'vue', 'angular', 'router'],
                implications: ['Client-side routing', 'State management', 'SEO considerations']
            },
            'rest-api': {
                description: 'RESTful API design',
                indicators: ['routes', 'endpoints', 'http', 'json'],
                implications: ['Stateless design', 'Resource-based URLs', 'HTTP methods']
            },
            'event-driven': {
                description: 'Event-driven architecture',
                indicators: ['events', 'queue', 'pub-sub', 'messaging'],
                implications: ['Loose coupling', 'Asynchronous processing', 'Event sourcing']
            }
        };
    }

    /**
     * Check if project matches a pattern
     * @param {Object} projectContext - Project context
     * @param {Object} patternDef - Pattern definition
     * @returns {boolean} True if matches
     * @private
     */
    _matchesPattern(projectContext, patternDef) {
        const allText = JSON.stringify(projectContext).toLowerCase();
        return patternDef.indicators.some(indicator => allText.includes(indicator));
    }

    /**
     * Calculate pattern confidence
     * @param {Object} projectContext - Project context
     * @param {Object} patternDef - Pattern definition
     * @returns {number} Confidence score
     * @private
     */
    _calculatePatternConfidence(projectContext, patternDef) {
        const allText = JSON.stringify(projectContext).toLowerCase();
        const matches = patternDef.indicators.filter(indicator => allText.includes(indicator)).length;
        return matches / patternDef.indicators.length;
    }

    /**
     * Calculate confidence score
     * @param {Object} structure - Project structure
     * @returns {number} Confidence score
     * @private
     */
    _calculateConfidence(structure) {
        let confidence = 0.5; // Base confidence
        
        if (structure.type !== 'unknown') confidence += 0.2;
        if (structure.domain !== 'general') confidence += 0.2;
        if (structure.characteristics.length > 0) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    /**
     * Extract characteristics from description
     * @param {string} description - Project description
     * @returns {Array} Characteristics
     * @private
     */
    _extractCharacteristics(description) {
        const characteristics = [];
        const descLower = description.toLowerCase();
        
        const charMap = {
            'real-time': ['real-time', 'live', 'instant'],
            'scalable': ['scalable', 'scale', 'high-traffic'],
            'secure': ['secure', 'security', 'authentication'],
            'mobile-friendly': ['mobile', 'responsive', 'mobile-first'],
            'api-first': ['api', 'headless', 'backend'],
            'data-intensive': ['data', 'analytics', 'big-data']
        };

        for (const [char, keywords] of Object.entries(charMap)) {
            if (keywords.some(keyword => descLower.includes(keyword))) {
                characteristics.push(char);
            }
        }

        return characteristics;
    }

    /**
     * Identify architectural patterns
     * @param {Object} fileStructure - File structure
     * @returns {Array} Architectural patterns
     * @private
     */
    _identifyArchitecturalPatterns(fileStructure) {
        // Simplified implementation
        return ['layered', 'component-based'];
    }

    /**
     * Identify design patterns
     * @param {Object} fileStructure - File structure
     * @returns {Array} Design patterns
     * @private
     */
    _identifyDesignPatterns(fileStructure) {
        // Simplified implementation
        return ['factory', 'observer'];
    }

    /**
     * Identify coding patterns
     * @param {Object} codebase - Codebase information
     * @returns {Array} Coding patterns
     * @private
     */
    _identifyCodingPatterns(codebase) {
        // Simplified implementation
        return ['async-await', 'error-handling'];
    }

    /**
     * Identify testing patterns
     * @param {Object} codebase - Codebase information
     * @returns {Array} Testing patterns
     * @private
     */
    _identifyTestingPatterns(codebase) {
        // Simplified implementation
        return ['unit-testing', 'integration-testing'];
    }

    /**
     * Identify deployment patterns
     * @param {Object} deployment - Deployment information
     * @returns {Array} Deployment patterns
     * @private
     */
    _identifyDeploymentPatterns(deployment) {
        // Simplified implementation
        return ['containerized', 'ci-cd'];
    }

    /**
     * Extract primary technologies
     * @param {Object} dependencies - Dependencies information
     * @returns {Array} Primary technologies
     * @private
     */
    _extractPrimaryTechnologies(dependencies) {
        // Simplified implementation
        return ['javascript', 'node.js'];
    }

    /**
     * Extract frameworks
     * @param {Object} dependencies - Dependencies information
     * @returns {Array} Frameworks
     * @private
     */
    _extractFrameworks(dependencies) {
        // Simplified implementation
        return ['express', 'react'];
    }

    /**
     * Extract libraries
     * @param {Object} dependencies - Dependencies information
     * @returns {Array} Libraries
     * @private
     */
    _extractLibraries(dependencies) {
        // Simplified implementation
        return ['lodash', 'axios'];
    }

    /**
     * Generate technology recommendations
     * @param {Object} projectContext - Project context
     * @returns {Array} Technology recommendations
     * @private
     */
    _generateTechnologyRecommendations(projectContext) {
        return [
            {
                type: 'technology',
                priority: 'medium',
                recommendation: 'Consider using TypeScript for better type safety',
                rationale: 'Improves code quality and developer experience'
            }
        ];
    }

    /**
     * Generate architecture recommendations
     * @param {Object} projectContext - Project context
     * @returns {Array} Architecture recommendations
     * @private
     */
    _generateArchitectureRecommendations(projectContext) {
        return [
            {
                type: 'architecture',
                priority: 'high',
                recommendation: 'Implement proper error handling patterns',
                rationale: 'Improves system reliability and debugging'
            }
        ];
    }

    /**
     * Generate best practices recommendations
     * @param {Object} projectContext - Project context
     * @returns {Array} Best practices recommendations
     * @private
     */
    _generateBestPracticesRecommendations(projectContext) {
        return [
            {
                type: 'best-practice',
                priority: 'medium',
                recommendation: 'Add comprehensive unit tests',
                rationale: 'Ensures code quality and prevents regressions'
            }
        ];
    }

    /**
     * Ensure analyzer is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Context Analyzer not initialized. Call initialize() first.');
        }
    }

    /**
     * Get analyzer statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            cacheSize: this.contextCache.size,
            patternsCount: Object.keys(this.analysisPatterns).length
        };
    }
}

export default ContextAnalyzer;

