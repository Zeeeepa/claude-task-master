/**
 * @fileoverview Complexity Estimator
 * @description Estimates complexity of requirements and tasks using multiple metrics
 * including technical complexity, implementation difficulty, and resource requirements.
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Complexity Estimator for requirement and task analysis
 */
export class ComplexityEstimator {
    constructor() {
        this.isInitialized = false;
        this.complexityFactors = this._initializeComplexityFactors();
        this.estimationModels = this._initializeEstimationModels();
        
        log('debug', 'Complexity Estimator created');
    }

    /**
     * Initialize the complexity estimator
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing Complexity Estimator...');
        
        try {
            // Initialize complexity estimation components
            this.isInitialized = true;
            log('info', 'Complexity Estimator initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Complexity Estimator:', error);
            throw error;
        }
    }

    /**
     * Estimate complexity of requirement text and project context
     * @param {string} requirementText - Requirement text to analyze
     * @param {Object} projectContext - Project context information
     * @returns {Promise<Object>} Complexity estimation results
     */
    async estimate(requirementText, projectContext) {
        this._ensureInitialized();
        
        log('debug', 'Estimating complexity', {
            textLength: requirementText.length,
            hasContext: !!projectContext
        });

        try {
            const estimation = {
                overall: 0,
                dimensions: {},
                factors: {},
                confidence: 0,
                breakdown: {},
                recommendations: []
            };

            // Analyze different complexity dimensions
            estimation.dimensions.technical = await this.estimateTechnicalComplexity(requirementText, projectContext);
            estimation.dimensions.functional = await this.estimateFunctionalComplexity(requirementText);
            estimation.dimensions.integration = await this.estimateIntegrationComplexity(requirementText, projectContext);
            estimation.dimensions.data = await this.estimateDataComplexity(requirementText);
            estimation.dimensions.ui = await this.estimateUIComplexity(requirementText);
            estimation.dimensions.performance = await this.estimatePerformanceComplexity(requirementText);
            estimation.dimensions.security = await this.estimateSecurityComplexity(requirementText);

            // Calculate overall complexity
            estimation.overall = this.calculateOverallComplexity(estimation.dimensions);

            // Identify complexity factors
            estimation.factors = await this.identifyComplexityFactors(requirementText, projectContext);

            // Generate breakdown
            estimation.breakdown = this.generateComplexityBreakdown(estimation.dimensions, estimation.factors);

            // Calculate confidence
            estimation.confidence = this.calculateConfidence(estimation);

            // Generate recommendations
            estimation.recommendations = this.generateComplexityRecommendations(estimation);

            log('debug', 'Complexity estimation completed', {
                overall: estimation.overall,
                confidence: estimation.confidence,
                topFactors: Object.keys(estimation.factors).slice(0, 3)
            });

            return estimation;
        } catch (error) {
            log('error', 'Failed to estimate complexity:', error);
            throw error;
        }
    }

    /**
     * Estimate technical complexity
     * @param {string} requirementText - Requirement text
     * @param {Object} projectContext - Project context
     * @returns {Promise<number>} Technical complexity score (1-10)
     */
    async estimateTechnicalComplexity(requirementText, projectContext) {
        try {
            let complexity = 1;
            const text = requirementText.toLowerCase();

            // Technology complexity indicators
            const techIndicators = {
                'machine learning': 4,
                'artificial intelligence': 4,
                'blockchain': 3,
                'microservices': 3,
                'distributed system': 3,
                'real-time': 2,
                'concurrent': 2,
                'parallel': 2,
                'async': 1,
                'integration': 1,
                'api': 1
            };

            for (const [indicator, score] of Object.entries(techIndicators)) {
                if (text.includes(indicator)) {
                    complexity += score;
                }
            }

            // Project context complexity
            if (projectContext) {
                if (projectContext.technology?.primary?.length > 3) complexity += 1;
                if (projectContext.architecture?.style === 'microservices') complexity += 2;
                if (projectContext.dependencies?.external?.length > 20) complexity += 1;
            }

            return Math.min(complexity, 10);
        } catch (error) {
            log('error', 'Failed to estimate technical complexity:', error);
            return 5;
        }
    }

    /**
     * Estimate functional complexity
     * @param {string} requirementText - Requirement text
     * @returns {Promise<number>} Functional complexity score (1-10)
     */
    async estimateFunctionalComplexity(requirementText) {
        try {
            let complexity = 1;
            const text = requirementText.toLowerCase();

            // Count functional requirements
            const functionalIndicators = [
                'create', 'read', 'update', 'delete', 'search', 'filter', 'sort',
                'validate', 'authenticate', 'authorize', 'notify', 'calculate',
                'process', 'transform', 'import', 'export', 'sync', 'backup'
            ];

            const functionalCount = functionalIndicators.filter(indicator => 
                text.includes(indicator)
            ).length;

            complexity += Math.min(functionalCount * 0.5, 5);

            // Business logic complexity
            const businessLogicIndicators = [
                'business rule', 'workflow', 'approval', 'validation',
                'calculation', 'algorithm', 'logic', 'condition'
            ];

            const businessLogicCount = businessLogicIndicators.filter(indicator => 
                text.includes(indicator)
            ).length;

            complexity += Math.min(businessLogicCount * 0.8, 4);

            // User interaction complexity
            if (text.includes('user interface') || text.includes('ui')) complexity += 1;
            if (text.includes('dashboard')) complexity += 1;
            if (text.includes('report')) complexity += 1;

            return Math.min(complexity, 10);
        } catch (error) {
            log('error', 'Failed to estimate functional complexity:', error);
            return 5;
        }
    }

    /**
     * Estimate integration complexity
     * @param {string} requirementText - Requirement text
     * @param {Object} projectContext - Project context
     * @returns {Promise<number>} Integration complexity score (1-10)
     */
    async estimateIntegrationComplexity(requirementText, projectContext) {
        try {
            let complexity = 1;
            const text = requirementText.toLowerCase();

            // External integration indicators
            const integrationIndicators = {
                'third-party': 2,
                'external api': 2,
                'webhook': 1,
                'payment gateway': 3,
                'social media': 1,
                'email service': 1,
                'sms service': 1,
                'cloud service': 2,
                'database integration': 2,
                'file system': 1
            };

            for (const [indicator, score] of Object.entries(integrationIndicators)) {
                if (text.includes(indicator)) {
                    complexity += score;
                }
            }

            // Count number of integrations mentioned
            const integrationCount = (text.match(/integrate|integration/g) || []).length;
            complexity += Math.min(integrationCount * 0.5, 3);

            // Project context integration complexity
            if (projectContext?.dependencies?.external?.length > 10) {
                complexity += 1;
            }

            return Math.min(complexity, 10);
        } catch (error) {
            log('error', 'Failed to estimate integration complexity:', error);
            return 3;
        }
    }

    /**
     * Estimate data complexity
     * @param {string} requirementText - Requirement text
     * @returns {Promise<number>} Data complexity score (1-10)
     */
    async estimateDataComplexity(requirementText) {
        try {
            let complexity = 1;
            const text = requirementText.toLowerCase();

            // Data operation indicators
            const dataIndicators = {
                'big data': 4,
                'data warehouse': 3,
                'data migration': 3,
                'data transformation': 2,
                'data validation': 1,
                'data import': 1,
                'data export': 1,
                'reporting': 2,
                'analytics': 2,
                'aggregation': 2
            };

            for (const [indicator, score] of Object.entries(dataIndicators)) {
                if (text.includes(indicator)) {
                    complexity += score;
                }
            }

            // Database complexity
            if (text.includes('multiple databases')) complexity += 2;
            if (text.includes('database schema')) complexity += 1;
            if (text.includes('complex queries')) complexity += 2;

            // Data volume indicators
            if (text.includes('large volume') || text.includes('high volume')) complexity += 2;
            if (text.includes('real-time data')) complexity += 2;

            return Math.min(complexity, 10);
        } catch (error) {
            log('error', 'Failed to estimate data complexity:', error);
            return 3;
        }
    }

    /**
     * Estimate UI complexity
     * @param {string} requirementText - Requirement text
     * @returns {Promise<number>} UI complexity score (1-10)
     */
    async estimateUIComplexity(requirementText) {
        try {
            let complexity = 1;
            const text = requirementText.toLowerCase();

            // UI complexity indicators
            const uiIndicators = {
                'responsive design': 2,
                'mobile app': 2,
                'desktop app': 2,
                'dashboard': 2,
                'data visualization': 3,
                'charts': 2,
                'graphs': 2,
                'interactive': 2,
                'drag and drop': 2,
                'real-time updates': 3,
                'animations': 1,
                'custom components': 2
            };

            for (const [indicator, score] of Object.entries(uiIndicators)) {
                if (text.includes(indicator)) {
                    complexity += score;
                }
            }

            // Count UI elements
            const uiElements = ['form', 'table', 'list', 'menu', 'button', 'modal', 'dialog'];
            const uiElementCount = uiElements.filter(element => text.includes(element)).length;
            complexity += Math.min(uiElementCount * 0.3, 2);

            // Accessibility requirements
            if (text.includes('accessibility') || text.includes('a11y')) complexity += 1;

            return Math.min(complexity, 10);
        } catch (error) {
            log('error', 'Failed to estimate UI complexity:', error);
            return 3;
        }
    }

    /**
     * Estimate performance complexity
     * @param {string} requirementText - Requirement text
     * @returns {Promise<number>} Performance complexity score (1-10)
     */
    async estimatePerformanceComplexity(requirementText) {
        try {
            let complexity = 1;
            const text = requirementText.toLowerCase();

            // Performance indicators
            const performanceIndicators = {
                'high performance': 3,
                'optimization': 2,
                'caching': 2,
                'load balancing': 3,
                'scalability': 2,
                'concurrent users': 2,
                'response time': 2,
                'throughput': 2,
                'latency': 2,
                'memory optimization': 2
            };

            for (const [indicator, score] of Object.entries(performanceIndicators)) {
                if (text.includes(indicator)) {
                    complexity += score;
                }
            }

            // Performance requirements
            if (text.includes('milliseconds') || text.includes('sub-second')) complexity += 2;
            if (text.includes('thousands of users') || text.includes('millions')) complexity += 3;

            return Math.min(complexity, 10);
        } catch (error) {
            log('error', 'Failed to estimate performance complexity:', error);
            return 2;
        }
    }

    /**
     * Estimate security complexity
     * @param {string} requirementText - Requirement text
     * @returns {Promise<number>} Security complexity score (1-10)
     */
    async estimateSecurityComplexity(requirementText) {
        try {
            let complexity = 1;
            const text = requirementText.toLowerCase();

            // Security indicators
            const securityIndicators = {
                'authentication': 2,
                'authorization': 2,
                'encryption': 3,
                'security audit': 3,
                'compliance': 3,
                'gdpr': 2,
                'hipaa': 3,
                'pci dss': 3,
                'oauth': 2,
                'jwt': 1,
                'ssl': 1,
                'two-factor': 2,
                'multi-factor': 3
            };

            for (const [indicator, score] of Object.entries(securityIndicators)) {
                if (text.includes(indicator)) {
                    complexity += score;
                }
            }

            // Security requirements
            if (text.includes('secure') || text.includes('security')) complexity += 1;
            if (text.includes('sensitive data')) complexity += 2;
            if (text.includes('personal information')) complexity += 2;

            return Math.min(complexity, 10);
        } catch (error) {
            log('error', 'Failed to estimate security complexity:', error);
            return 2;
        }
    }

    /**
     * Calculate overall complexity from dimensions
     * @param {Object} dimensions - Complexity dimensions
     * @returns {number} Overall complexity score (1-10)
     */
    calculateOverallComplexity(dimensions) {
        const weights = {
            technical: 0.25,
            functional: 0.20,
            integration: 0.15,
            data: 0.15,
            ui: 0.10,
            performance: 0.10,
            security: 0.05
        };

        let weightedSum = 0;
        let totalWeight = 0;

        for (const [dimension, score] of Object.entries(dimensions)) {
            const weight = weights[dimension] || 0.1;
            weightedSum += score * weight;
            totalWeight += weight;
        }

        return Math.round((weightedSum / totalWeight) * 10) / 10;
    }

    /**
     * Identify complexity factors
     * @param {string} requirementText - Requirement text
     * @param {Object} projectContext - Project context
     * @returns {Promise<Object>} Complexity factors
     */
    async identifyComplexityFactors(requirementText, projectContext) {
        const factors = {};

        try {
            // Text-based factors
            const textFactors = this._analyzeTextComplexityFactors(requirementText);
            Object.assign(factors, textFactors);

            // Context-based factors
            if (projectContext) {
                const contextFactors = this._analyzeContextComplexityFactors(projectContext);
                Object.assign(factors, contextFactors);
            }

            return factors;
        } catch (error) {
            log('error', 'Failed to identify complexity factors:', error);
            return {};
        }
    }

    /**
     * Generate complexity breakdown
     * @param {Object} dimensions - Complexity dimensions
     * @param {Object} factors - Complexity factors
     * @returns {Object} Complexity breakdown
     */
    generateComplexityBreakdown(dimensions, factors) {
        return {
            dimensions: Object.entries(dimensions)
                .sort(([,a], [,b]) => b - a)
                .map(([name, score]) => ({ name, score, percentage: (score / 10) * 100 })),
            topFactors: Object.entries(factors)
                .sort(([,a], [,b]) => b.impact - a.impact)
                .slice(0, 5)
                .map(([name, data]) => ({ name, ...data })),
            riskAreas: this._identifyRiskAreas(dimensions, factors)
        };
    }

    /**
     * Calculate confidence in the estimation
     * @param {Object} estimation - Complexity estimation
     * @returns {number} Confidence score (0-1)
     */
    calculateConfidence(estimation) {
        let confidence = 0.5; // Base confidence

        // More dimensions analyzed = higher confidence
        const dimensionCount = Object.keys(estimation.dimensions).length;
        confidence += Math.min(dimensionCount * 0.05, 0.3);

        // More factors identified = higher confidence
        const factorCount = Object.keys(estimation.factors).length;
        confidence += Math.min(factorCount * 0.02, 0.2);

        return Math.min(confidence, 1.0);
    }

    /**
     * Generate complexity recommendations
     * @param {Object} estimation - Complexity estimation
     * @returns {Array} Recommendations
     */
    generateComplexityRecommendations(estimation) {
        const recommendations = [];

        // High complexity recommendations
        if (estimation.overall > 7) {
            recommendations.push({
                type: 'risk-mitigation',
                priority: 'high',
                message: 'High complexity detected. Consider breaking down into smaller tasks.',
                actions: ['Task decomposition', 'Risk assessment', 'Prototype development']
            });
        }

        // Dimension-specific recommendations
        for (const [dimension, score] of Object.entries(estimation.dimensions)) {
            if (score > 6) {
                const recommendation = this._getDimensionRecommendation(dimension, score);
                if (recommendation) {
                    recommendations.push(recommendation);
                }
            }
        }

        return recommendations.slice(0, 5); // Limit to top 5
    }

    /**
     * Analyze text complexity factors
     * @param {string} text - Requirement text
     * @returns {Object} Text complexity factors
     * @private
     */
    _analyzeTextComplexityFactors(text) {
        const factors = {};
        const textLower = text.toLowerCase();

        // Length factor
        if (text.length > 1000) {
            factors.lengthComplexity = {
                impact: 2,
                description: 'Long requirement text may indicate complex scope'
            };
        }

        // Technical terms density
        const technicalTerms = this._countTechnicalTerms(textLower);
        if (technicalTerms > 5) {
            factors.technicalDensity = {
                impact: technicalTerms * 0.3,
                description: `High density of technical terms (${technicalTerms})`
            };
        }

        // Uncertainty indicators
        const uncertaintyWords = ['maybe', 'possibly', 'might', 'could', 'unclear', 'tbd'];
        const uncertaintyCount = uncertaintyWords.filter(word => textLower.includes(word)).length;
        if (uncertaintyCount > 0) {
            factors.uncertainty = {
                impact: uncertaintyCount * 0.5,
                description: 'Uncertainty in requirements increases complexity'
            };
        }

        return factors;
    }

    /**
     * Analyze context complexity factors
     * @param {Object} projectContext - Project context
     * @returns {Object} Context complexity factors
     * @private
     */
    _analyzeContextComplexityFactors(projectContext) {
        const factors = {};

        // Technology stack complexity
        if (projectContext.technology?.primary?.length > 3) {
            factors.technologyStack = {
                impact: projectContext.technology.primary.length * 0.2,
                description: 'Multiple technologies increase integration complexity'
            };
        }

        // Architecture complexity
        if (projectContext.architecture?.style === 'microservices') {
            factors.architectureComplexity = {
                impact: 3,
                description: 'Microservices architecture adds distributed system complexity'
            };
        }

        // Dependency complexity
        if (projectContext.dependencies?.external?.length > 10) {
            factors.dependencyComplexity = {
                impact: 2,
                description: 'High number of external dependencies'
            };
        }

        return factors;
    }

    /**
     * Count technical terms in text
     * @param {string} text - Text to analyze
     * @returns {number} Count of technical terms
     * @private
     */
    _countTechnicalTerms(text) {
        const technicalTerms = [
            'api', 'database', 'framework', 'library', 'algorithm', 'architecture',
            'microservice', 'authentication', 'authorization', 'encryption', 'optimization',
            'scalability', 'performance', 'integration', 'deployment', 'configuration',
            'middleware', 'backend', 'frontend', 'server', 'client', 'protocol',
            'interface', 'endpoint', 'webhook', 'queue', 'cache', 'session'
        ];

        return technicalTerms.filter(term => text.includes(term)).length;
    }

    /**
     * Identify risk areas
     * @param {Object} dimensions - Complexity dimensions
     * @param {Object} factors - Complexity factors
     * @returns {Array} Risk areas
     * @private
     */
    _identifyRiskAreas(dimensions, factors) {
        const riskAreas = [];

        // High complexity dimensions
        for (const [dimension, score] of Object.entries(dimensions)) {
            if (score > 7) {
                riskAreas.push({
                    area: dimension,
                    risk: 'high',
                    reason: `High ${dimension} complexity (${score}/10)`
                });
            }
        }

        // High impact factors
        for (const [factor, data] of Object.entries(factors)) {
            if (data.impact > 3) {
                riskAreas.push({
                    area: factor,
                    risk: 'medium',
                    reason: data.description
                });
            }
        }

        return riskAreas;
    }

    /**
     * Get dimension-specific recommendation
     * @param {string} dimension - Complexity dimension
     * @param {number} score - Complexity score
     * @returns {Object|null} Recommendation
     * @private
     */
    _getDimensionRecommendation(dimension, score) {
        const recommendations = {
            technical: {
                type: 'technical-complexity',
                priority: 'high',
                message: 'High technical complexity. Consider proof of concept.',
                actions: ['Technical spike', 'Architecture review', 'Expert consultation']
            },
            integration: {
                type: 'integration-complexity',
                priority: 'medium',
                message: 'Complex integrations detected. Plan integration testing.',
                actions: ['Integration mapping', 'API documentation', 'Mock services']
            },
            performance: {
                type: 'performance-complexity',
                priority: 'medium',
                message: 'Performance requirements are complex. Plan performance testing.',
                actions: ['Performance benchmarks', 'Load testing', 'Optimization strategy']
            },
            security: {
                type: 'security-complexity',
                priority: 'high',
                message: 'Complex security requirements. Security review needed.',
                actions: ['Security audit', 'Compliance review', 'Penetration testing']
            }
        };

        return recommendations[dimension] || null;
    }

    /**
     * Initialize complexity factors
     * @returns {Object} Complexity factors
     * @private
     */
    _initializeComplexityFactors() {
        return {
            technical: ['new technology', 'complex algorithm', 'performance critical'],
            functional: ['business logic', 'user workflow', 'data processing'],
            integration: ['external api', 'third party', 'legacy system'],
            ui: ['responsive design', 'interactive', 'real-time'],
            data: ['large dataset', 'complex queries', 'data migration'],
            security: ['authentication', 'encryption', 'compliance']
        };
    }

    /**
     * Initialize estimation models
     * @returns {Object} Estimation models
     * @private
     */
    _initializeEstimationModels() {
        return {
            simple: { baseEffort: 1, multiplier: 1.0 },
            moderate: { baseEffort: 3, multiplier: 1.5 },
            complex: { baseEffort: 8, multiplier: 2.0 },
            veryComplex: { baseEffort: 20, multiplier: 3.0 }
        };
    }

    /**
     * Ensure estimator is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Complexity Estimator not initialized. Call initialize() first.');
        }
    }

    /**
     * Get estimator statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            factorsCount: Object.keys(this.complexityFactors).length,
            modelsCount: Object.keys(this.estimationModels).length
        };
    }
}

export default ComplexityEstimator;

