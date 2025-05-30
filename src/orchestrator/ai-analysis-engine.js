/**
 * @fileoverview AI Analysis Engine
 * @description AI-powered analysis engine that performs comprehensive requirement analysis,
 * feature extraction, complexity estimation, and acceptance criteria generation.
 */

import { log } from '../../scripts/modules/utils.js';
import { NLPProcessor } from '../engines/nlp-processor.js';
import { ContextAnalyzer } from '../engines/context-analyzer.js';
import { ComplexityEstimator } from '../engines/complexity-estimator.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * AI Analysis Engine for requirement processing
 */
export class AIAnalysisEngine {
    constructor() {
        this.nlpProcessor = new NLPProcessor();
        this.contextAnalyzer = new ContextAnalyzer();
        this.complexityEstimator = new ComplexityEstimator();
        this.isInitialized = false;
        
        log('debug', 'AI Analysis Engine created');
    }

    /**
     * Initialize the analysis engine
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing AI Analysis Engine...');
        
        try {
            await this.nlpProcessor.initialize();
            await this.contextAnalyzer.initialize();
            await this.complexityEstimator.initialize();
            
            this.isInitialized = true;
            log('info', 'AI Analysis Engine initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize AI Analysis Engine:', error);
            throw error;
        }
    }

    /**
     * Analyze requirement with AI-powered insights
     * @param {string} requirementText - The requirement text to analyze
     * @param {Object} projectContext - Project context information
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeRequirement(requirementText, projectContext) {
        this._ensureInitialized();
        
        log('info', 'Starting requirement analysis', {
            textLength: requirementText.length,
            hasContext: !!projectContext
        });

        const analysis = {
            id: this.generateAnalysisId(),
            originalText: requirementText,
            processedAt: new Date(),
            insights: {}
        };

        try {
            // NLP Processing
            log('debug', 'Running NLP processing...');
            analysis.insights.nlp = await this.nlpProcessor.process(requirementText);
            
            // Context Analysis
            log('debug', 'Running context analysis...');
            analysis.insights.context = await this.contextAnalyzer.analyze(projectContext);
            
            // Complexity Estimation
            log('debug', 'Running complexity estimation...');
            analysis.insights.complexity = await this.complexityEstimator.estimate(
                requirementText, 
                projectContext
            );

            // Feature Extraction
            log('debug', 'Extracting features...');
            analysis.insights.features = await this.extractFeatures(requirementText);
            
            // Technical Requirements
            log('debug', 'Extracting technical requirements...');
            analysis.insights.technical = await this.extractTechnicalRequirements(requirementText);
            
            // Acceptance Criteria Generation
            log('debug', 'Generating acceptance criteria...');
            analysis.insights.acceptanceCriteria = await this.generateAcceptanceCriteria(
                analysis.insights.features
            );

            // Risk Assessment
            log('debug', 'Assessing risks...');
            analysis.insights.risks = await this.assessRisks(analysis);

            // Effort Estimation
            log('debug', 'Estimating effort...');
            analysis.insights.effort = await this.estimateEffort(analysis);

            log('info', 'Requirement analysis completed', {
                analysisId: analysis.id,
                featuresFound: analysis.insights.features.length,
                complexityScore: analysis.insights.complexity.overall,
                riskLevel: analysis.insights.risks.level
            });

            return analysis;
        } catch (error) {
            log('error', 'Failed to analyze requirement:', error);
            throw error;
        }
    }

    /**
     * Extract features from requirement text
     * @param {string} requirementText - The requirement text
     * @returns {Promise<Array>} Extracted features
     */
    async extractFeatures(requirementText) {
        const features = [];
        
        try {
            // Use AI to identify distinct features using pattern matching
            const featurePatterns = [
                /implement\s+([^.!?]+)/gi,
                /create\s+([^.!?]+)/gi,
                /add\s+([^.!?]+)/gi,
                /build\s+([^.!?]+)/gi,
                /develop\s+([^.!?]+)/gi,
                /design\s+([^.!?]+)/gi,
                /integrate\s+([^.!?]+)/gi,
                /configure\s+([^.!?]+)/gi
            ];

            const foundFeatures = new Set();

            for (const pattern of featurePatterns) {
                const matches = requirementText.matchAll(pattern);
                for (const match of matches) {
                    const description = match[1].trim();
                    if (description.length > 5 && description.length < 100) {
                        foundFeatures.add(description);
                    }
                }
            }

            // Convert to feature objects
            for (const description of foundFeatures) {
                features.push({
                    id: uuidv4(),
                    type: 'feature',
                    description: description,
                    priority: this.estimateFeaturePriority(description),
                    complexity: this.estimateFeatureComplexity(description),
                    category: this.categorizeFeature(description)
                });
            }

            // If no features found through patterns, create a generic one
            if (features.length === 0) {
                features.push({
                    id: uuidv4(),
                    type: 'feature',
                    description: 'Main requirement implementation',
                    priority: 'medium',
                    complexity: 'medium',
                    category: 'general'
                });
            }

            log('debug', `Extracted ${features.length} features`);
            return features;
        } catch (error) {
            log('error', 'Failed to extract features:', error);
            return [];
        }
    }

    /**
     * Extract technical requirements from text
     * @param {string} requirementText - The requirement text
     * @returns {Promise<Object>} Technical requirements
     */
    async extractTechnicalRequirements(requirementText) {
        const technical = {
            technologies: [],
            frameworks: [],
            databases: [],
            apis: [],
            security: [],
            performance: [],
            scalability: []
        };

        try {
            const text = requirementText.toLowerCase();

            // Technology detection
            const techPatterns = {
                technologies: [
                    'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c++', 'c#',
                    'react', 'vue', 'angular', 'node.js', 'express', 'fastapi', 'django'
                ],
                frameworks: [
                    'react', 'vue', 'angular', 'express', 'fastapi', 'django', 'spring',
                    'laravel', 'rails', 'flask', 'nest.js'
                ],
                databases: [
                    'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'sqlite',
                    'cassandra', 'dynamodb'
                ],
                apis: [
                    'rest', 'graphql', 'grpc', 'websocket', 'api', 'endpoint', 'microservice'
                ]
            };

            for (const [category, patterns] of Object.entries(techPatterns)) {
                for (const pattern of patterns) {
                    if (text.includes(pattern)) {
                        technical[category].push(pattern);
                    }
                }
            }

            // Security requirements
            if (text.includes('auth') || text.includes('security') || text.includes('login')) {
                technical.security.push('authentication');
            }
            if (text.includes('encrypt') || text.includes('secure')) {
                technical.security.push('encryption');
            }

            // Performance requirements
            if (text.includes('fast') || text.includes('performance') || text.includes('speed')) {
                technical.performance.push('optimization');
            }
            if (text.includes('cache') || text.includes('caching')) {
                technical.performance.push('caching');
            }

            // Scalability requirements
            if (text.includes('scale') || text.includes('scalable') || text.includes('load')) {
                technical.scalability.push('horizontal-scaling');
            }

            return technical;
        } catch (error) {
            log('error', 'Failed to extract technical requirements:', error);
            return technical;
        }
    }

    /**
     * Generate acceptance criteria using AI
     * @param {Array} features - Extracted features
     * @returns {Promise<Array>} Acceptance criteria
     */
    async generateAcceptanceCriteria(features) {
        const criteria = [];
        
        try {
            for (const feature of features) {
                const featureCriteria = await this.generateFeatureCriteria(feature);
                criteria.push(...featureCriteria);
            }

            // Add general criteria
            criteria.push(
                {
                    id: uuidv4(),
                    feature: 'general',
                    criteria: 'All code should be properly tested with unit tests',
                    testable: true,
                    priority: 'high',
                    type: 'testing'
                },
                {
                    id: uuidv4(),
                    feature: 'general',
                    criteria: 'Code should follow established coding standards and best practices',
                    testable: true,
                    priority: 'medium',
                    type: 'quality'
                },
                {
                    id: uuidv4(),
                    feature: 'general',
                    criteria: 'Implementation should be documented appropriately',
                    testable: true,
                    priority: 'medium',
                    type: 'documentation'
                }
            );

            return criteria;
        } catch (error) {
            log('error', 'Failed to generate acceptance criteria:', error);
            return [];
        }
    }

    /**
     * Generate criteria for a specific feature
     * @param {Object} feature - The feature object
     * @returns {Promise<Array>} Feature-specific criteria
     */
    async generateFeatureCriteria(feature) {
        try {
            // AI-powered criteria generation based on feature type and description
            const templates = [
                {
                    criteria: `Given ${feature.description}, when user interacts with the feature, then system should respond appropriately`,
                    type: 'functional'
                },
                {
                    criteria: `Given valid input for ${feature.description}, when processed, then output should be correct and complete`,
                    type: 'validation'
                },
                {
                    criteria: `Given ${feature.description} is implemented, when tested, then all tests should pass successfully`,
                    type: 'testing'
                }
            ];

            return templates.map(template => ({
                id: uuidv4(),
                feature: feature.description,
                criteria: template.criteria,
                testable: true,
                priority: feature.priority,
                type: template.type
            }));
        } catch (error) {
            log('error', 'Failed to generate feature criteria:', error);
            return [];
        }
    }

    /**
     * Assess risks in the requirement
     * @param {Object} analysis - Current analysis
     * @returns {Promise<Object>} Risk assessment
     */
    async assessRisks(analysis) {
        try {
            const risks = {
                level: 'low',
                factors: [],
                mitigation: []
            };

            // Complexity-based risks
            if (analysis.insights.complexity?.overall > 7) {
                risks.factors.push('High complexity implementation');
                risks.mitigation.push('Break down into smaller, manageable tasks');
                risks.level = 'high';
            }

            // Feature count risks
            if (analysis.insights.features?.length > 10) {
                risks.factors.push('Large number of features');
                risks.mitigation.push('Prioritize features and implement incrementally');
                if (risks.level === 'low') risks.level = 'medium';
            }

            // Technical risks
            const techReqs = analysis.insights.technical;
            if (techReqs?.technologies?.length > 5) {
                risks.factors.push('Multiple technology dependencies');
                risks.mitigation.push('Validate technology compatibility early');
                if (risks.level === 'low') risks.level = 'medium';
            }

            // Security risks
            if (techReqs?.security?.length > 0) {
                risks.factors.push('Security requirements present');
                risks.mitigation.push('Implement security review process');
            }

            return risks;
        } catch (error) {
            log('error', 'Failed to assess risks:', error);
            return { level: 'unknown', factors: [], mitigation: [] };
        }
    }

    /**
     * Estimate overall effort
     * @param {Object} analysis - Current analysis
     * @returns {Promise<Object>} Effort estimation
     */
    async estimateEffort(analysis) {
        try {
            const effort = {
                total: 0,
                breakdown: {},
                confidence: 'medium'
            };

            // Base effort from features
            const features = analysis.insights.features || [];
            let featureEffort = 0;
            
            for (const feature of features) {
                const complexity = feature.complexity;
                let hours = 2; // Base hours
                
                switch (complexity) {
                    case 'low': hours = 2; break;
                    case 'medium': hours = 5; break;
                    case 'high': hours = 10; break;
                    case 'very-high': hours = 20; break;
                }
                
                featureEffort += hours;
            }

            effort.breakdown.features = featureEffort;

            // Add overhead for testing, documentation, etc.
            effort.breakdown.testing = Math.ceil(featureEffort * 0.3);
            effort.breakdown.documentation = Math.ceil(featureEffort * 0.1);
            effort.breakdown.integration = Math.ceil(featureEffort * 0.2);
            effort.breakdown.overhead = Math.ceil(featureEffort * 0.1);

            effort.total = Object.values(effort.breakdown).reduce((sum, val) => sum + val, 0);

            // Adjust confidence based on complexity
            const complexity = analysis.insights.complexity?.overall || 5;
            if (complexity > 8) {
                effort.confidence = 'low';
                effort.total = Math.ceil(effort.total * 1.5); // Add uncertainty buffer
            } else if (complexity < 3) {
                effort.confidence = 'high';
            }

            return effort;
        } catch (error) {
            log('error', 'Failed to estimate effort:', error);
            return { total: 8, breakdown: {}, confidence: 'low' };
        }
    }

    /**
     * Estimate feature priority
     * @param {string} description - Feature description
     * @returns {string} Priority level
     */
    estimateFeaturePriority(description) {
        const text = description.toLowerCase();
        
        // High priority indicators
        if (text.includes('critical') || text.includes('urgent') || text.includes('security')) {
            return 'high';
        }
        
        // Low priority indicators
        if (text.includes('nice to have') || text.includes('optional') || text.includes('enhancement')) {
            return 'low';
        }
        
        return 'medium';
    }

    /**
     * Estimate feature complexity
     * @param {string} description - Feature description
     * @returns {string} Complexity level
     */
    estimateFeatureComplexity(description) {
        const text = description.toLowerCase();
        
        // High complexity indicators
        const highComplexityTerms = [
            'integration', 'algorithm', 'optimization', 'machine learning',
            'distributed', 'microservice', 'real-time', 'concurrent'
        ];
        
        // Low complexity indicators
        const lowComplexityTerms = [
            'display', 'show', 'simple', 'basic', 'static', 'read-only'
        ];
        
        if (highComplexityTerms.some(term => text.includes(term))) {
            return 'high';
        }
        
        if (lowComplexityTerms.some(term => text.includes(term))) {
            return 'low';
        }
        
        return 'medium';
    }

    /**
     * Categorize feature
     * @param {string} description - Feature description
     * @returns {string} Feature category
     */
    categorizeFeature(description) {
        const text = description.toLowerCase();
        
        if (text.includes('ui') || text.includes('interface') || text.includes('frontend')) {
            return 'frontend';
        }
        
        if (text.includes('api') || text.includes('backend') || text.includes('server')) {
            return 'backend';
        }
        
        if (text.includes('database') || text.includes('data') || text.includes('storage')) {
            return 'database';
        }
        
        if (text.includes('test') || text.includes('testing')) {
            return 'testing';
        }
        
        return 'general';
    }

    /**
     * Generate unique analysis ID
     * @returns {string} Analysis ID
     */
    generateAnalysisId() {
        return `analysis-${uuidv4()}`;
    }

    /**
     * Ensure engine is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('AI Analysis Engine not initialized. Call initialize() first.');
        }
    }

    /**
     * Get engine statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            components: {
                nlpProcessor: this.nlpProcessor.isInitialized,
                contextAnalyzer: this.contextAnalyzer.isInitialized,
                complexityEstimator: this.complexityEstimator.isInitialized
            }
        };
    }
}

export default AIAnalysisEngine;

