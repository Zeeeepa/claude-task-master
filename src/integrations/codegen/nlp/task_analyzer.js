/**
 * @fileoverview Task Analyzer for Natural Language Processing
 * @description Analyzes natural language task descriptions and extracts structured requirements
 */

import { log } from '../../../utils/logger.js';

/**
 * Task Analyzer
 * Processes natural language descriptions into structured task data
 */
export class TaskAnalyzer {
    constructor(config = {}) {
        this.config = {
            maxComplexityScore: config.maxComplexityScore || 100,
            enableDetailedAnalysis: config.enableDetailedAnalysis !== false,
            supportedLanguages: config.supportedLanguages || [
                'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
            ],
            supportedFrameworks: config.supportedFrameworks || [
                'react', 'vue', 'angular', 'express', 'fastapi', 'django', 'spring', 'rails'
            ],
            ...config
        };
        
        // Intent patterns for classification
        this.intentPatterns = {
            create: [
                /create|build|implement|develop|add|make|generate/i,
                /new\s+(feature|component|function|class|module)/i,
                /build\s+(a|an|the)/i
            ],
            modify: [
                /update|change|modify|edit|alter|improve|enhance/i,
                /fix|repair|correct|resolve/i,
                /refactor|restructure|reorganize/i
            ],
            delete: [
                /remove|delete|eliminate|drop/i,
                /clean\s+up|cleanup/i
            ],
            test: [
                /test|testing|spec|unit\s+test|integration\s+test/i,
                /write\s+tests|add\s+tests/i
            ],
            document: [
                /document|documentation|readme|comment/i,
                /write\s+docs|add\s+documentation/i
            ]
        };
        
        // Complexity factors
        this.complexityFactors = {
            lines: 0.1,
            functions: 2,
            classes: 3,
            files: 1.5,
            dependencies: 1,
            patterns: 0.5,
            integrations: 2,
            database: 1.5,
            authentication: 2,
            testing: 1
        };
        
        log('debug', 'Task Analyzer initialized', {
            maxComplexityScore: this.config.maxComplexityScore,
            supportedLanguages: this.config.supportedLanguages.length,
            supportedFrameworks: this.config.supportedFrameworks.length
        });
    }

    /**
     * Initialize the analyzer
     * @returns {Promise<void>}
     */
    async initialize() {
        log('info', 'Task Analyzer initialized');
    }

    /**
     * Analyze a natural language task description
     * @param {string} description - Task description
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Analysis result
     */
    async analyzeTask(description, context = {}) {
        try {
            log('debug', 'Analyzing task', { 
                descriptionLength: description.length,
                hasContext: Object.keys(context).length > 0
            });
            
            const analysis = {
                originalDescription: description,
                intent: this._analyzeIntent(description),
                complexity: this._analyzeComplexity(description, context),
                requirements: this._extractRequirements(description),
                technologies: this._identifyTechnologies(description, context),
                scope: this._analyzeScope(description),
                riskFactors: this._identifyRiskFactors(description),
                priority: this._calculatePriority(description, context)
            };
            
            log('debug', 'Task analysis completed', {
                intent: analysis.intent.primary,
                complexity: analysis.complexity.level,
                estimatedHours: analysis.complexity.estimatedHours,
                technologies: analysis.technologies.languages.length
            });
            
            return analysis;
            
        } catch (error) {
            log('error', 'Task analysis failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Get analyzer status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: true,
            config: {
                maxComplexityScore: this.config.maxComplexityScore,
                enableDetailedAnalysis: this.config.enableDetailedAnalysis,
                supportedLanguages: this.config.supportedLanguages.length,
                supportedFrameworks: this.config.supportedFrameworks.length
            }
        };
    }

    /**
     * Analyze intent from description
     * @param {string} description - Task description
     * @returns {Object} Intent analysis
     * @private
     */
    _analyzeIntent(description) {
        const intents = {};
        
        // Check each intent pattern
        for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
            let confidence = 0;
            
            for (const pattern of patterns) {
                if (pattern.test(description)) {
                    confidence = Math.max(confidence, 0.8);
                }
            }
            
            if (confidence > 0) {
                intents[intent] = confidence;
            }
        }
        
        // Determine primary intent
        const primaryIntent = Object.entries(intents)
            .sort(([,a], [,b]) => b - a)[0];
        
        return {
            primary: primaryIntent ? primaryIntent[0] : 'create',
            confidence: primaryIntent ? primaryIntent[1] : 0.5,
            all: intents,
            description: this._getIntentDescription(primaryIntent ? primaryIntent[0] : 'create')
        };
    }

    /**
     * Analyze complexity of the task
     * @param {string} description - Task description
     * @param {Object} context - Additional context
     * @returns {Object} Complexity analysis
     * @private
     */
    _analyzeComplexity(description, context) {
        let score = 0;
        const factors = {};
        
        // Analyze description for complexity indicators
        const words = description.toLowerCase().split(/\s+/);
        
        // Function/method indicators
        const functionKeywords = ['function', 'method', 'endpoint', 'api', 'route'];
        const functionCount = functionKeywords.reduce((count, keyword) => 
            count + (words.filter(word => word.includes(keyword)).length), 0);
        factors.functions = functionCount;
        score += functionCount * this.complexityFactors.functions;
        
        // Class/component indicators
        const classKeywords = ['class', 'component', 'service', 'module'];
        const classCount = classKeywords.reduce((count, keyword) => 
            count + (words.filter(word => word.includes(keyword)).length), 0);
        factors.classes = classCount;
        score += classCount * this.complexityFactors.classes;
        
        // File indicators
        const fileKeywords = ['file', 'files', 'multiple'];
        const fileCount = Math.max(1, fileKeywords.reduce((count, keyword) => 
            count + (words.filter(word => word.includes(keyword)).length), 0));
        factors.files = fileCount;
        score += fileCount * this.complexityFactors.files;
        
        // Integration complexity
        const integrationKeywords = ['api', 'database', 'external', 'third-party', 'integration'];
        const integrationCount = integrationKeywords.reduce((count, keyword) => 
            count + (words.filter(word => word.includes(keyword)).length), 0);
        factors.integrations = integrationCount;
        score += integrationCount * this.complexityFactors.integrations;
        
        // Authentication complexity
        const authKeywords = ['auth', 'login', 'authentication', 'authorization', 'security'];
        const authCount = authKeywords.reduce((count, keyword) => 
            count + (words.filter(word => word.includes(keyword)).length), 0);
        factors.authentication = authCount;
        score += authCount * this.complexityFactors.authentication;
        
        // Testing complexity
        const testKeywords = ['test', 'testing', 'spec', 'coverage'];
        const testCount = testKeywords.reduce((count, keyword) => 
            count + (words.filter(word => word.includes(keyword)).length), 0);
        factors.testing = testCount;
        score += testCount * this.complexityFactors.testing;
        
        // Estimate lines of code
        const estimatedLines = Math.max(10, score * 5);
        factors.estimatedLines = estimatedLines;
        
        // Estimate hours
        const estimatedHours = Math.max(1, Math.round(score / 5));
        
        // Determine complexity level
        let level = 'simple';
        if (score > 20) level = 'complex';
        else if (score > 10) level = 'medium';
        
        return {
            score: Math.min(score, this.config.maxComplexityScore),
            level,
            factors,
            estimatedHours,
            estimatedLines,
            estimatedFiles: Math.max(1, Math.round(fileCount))
        };
    }

    /**
     * Extract requirements from description
     * @param {string} description - Task description
     * @returns {Object} Requirements analysis
     * @private
     */
    _extractRequirements(description) {
        const requirements = {
            functional: [],
            nonFunctional: {},
            technical: {},
            business: {},
            constraints: {}
        };
        
        // Extract functional requirements (simplified)
        const sentences = description.split(/[.!?]+/).filter(s => s.trim());
        
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed.length > 10) {
                const confidence = this._calculateRequirementConfidence(trimmed);
                if (confidence > 0.5) {
                    requirements.functional.push({
                        text: trimmed,
                        type: 'explicit',
                        confidence
                    });
                }
            }
        }
        
        // Identify non-functional requirements
        const nfKeywords = {
            performance: ['fast', 'quick', 'performance', 'speed', 'efficient'],
            security: ['secure', 'security', 'auth', 'permission', 'safe'],
            usability: ['user-friendly', 'easy', 'intuitive', 'simple'],
            reliability: ['reliable', 'stable', 'robust', 'error handling'],
            scalability: ['scalable', 'scale', 'growth', 'load']
        };
        
        for (const [category, keywords] of Object.entries(nfKeywords)) {
            const matches = keywords.filter(keyword => 
                description.toLowerCase().includes(keyword));
            
            if (matches.length > 0) {
                requirements.nonFunctional[category] = {
                    detected: true,
                    keywords: matches,
                    confidence: Math.min(0.9, matches.length * 0.3)
                };
            }
        }
        
        return requirements;
    }

    /**
     * Identify technologies from description and context
     * @param {string} description - Task description
     * @param {Object} context - Additional context
     * @returns {Object} Technology analysis
     * @private
     */
    _identifyTechnologies(description, context) {
        const technologies = {
            languages: [],
            frameworks: [],
            databases: [],
            tools: []
        };
        
        const text = description.toLowerCase();
        
        // Identify languages
        for (const lang of this.config.supportedLanguages) {
            if (text.includes(lang) || context.language === lang) {
                technologies.languages.push({
                    name: lang,
                    confidence: context.language === lang ? 0.9 : 0.7,
                    source: context.language === lang ? 'context' : 'description'
                });
            }
        }
        
        // Identify frameworks
        for (const framework of this.config.supportedFrameworks) {
            if (text.includes(framework) || context.framework === framework) {
                technologies.frameworks.push({
                    name: framework,
                    confidence: context.framework === framework ? 0.9 : 0.7,
                    source: context.framework === framework ? 'context' : 'description'
                });
            }
        }
        
        // Identify databases
        const databases = ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite'];
        for (const db of databases) {
            if (text.includes(db)) {
                technologies.databases.push({
                    name: db,
                    confidence: 0.8
                });
            }
        }
        
        // Identify tools
        const tools = ['git', 'docker', 'kubernetes', 'aws', 'azure', 'gcp'];
        for (const tool of tools) {
            if (text.includes(tool)) {
                technologies.tools.push({
                    name: tool,
                    confidence: 0.7
                });
            }
        }
        
        return technologies;
    }

    /**
     * Analyze scope of the task
     * @param {string} description - Task description
     * @returns {Object} Scope analysis
     * @private
     */
    _analyzeScope(description) {
        const words = description.split(/\s+/).length;
        
        let size = 'small';
        if (words > 100) size = 'large';
        else if (words > 50) size = 'medium';
        
        // Identify affected areas
        const areas = [];
        const areaKeywords = {
            frontend: ['ui', 'frontend', 'client', 'browser', 'component'],
            backend: ['api', 'server', 'backend', 'service', 'endpoint'],
            database: ['database', 'db', 'storage', 'data'],
            testing: ['test', 'testing', 'spec', 'coverage'],
            documentation: ['docs', 'documentation', 'readme']
        };
        
        for (const [area, keywords] of Object.entries(areaKeywords)) {
            if (keywords.some(keyword => description.toLowerCase().includes(keyword))) {
                areas.push(area);
            }
        }
        
        return {
            size,
            affectedAreas: areas,
            estimatedFiles: Math.max(1, Math.ceil(words / 50)),
            estimatedLines: Math.max(10, words * 2)
        };
    }

    /**
     * Identify risk factors
     * @param {string} description - Task description
     * @returns {Array} Risk factors
     * @private
     */
    _identifyRiskFactors(description) {
        const risks = [];
        const text = description.toLowerCase();
        
        const riskPatterns = {
            'High Complexity': ['complex', 'complicated', 'advanced', 'sophisticated'],
            'External Dependencies': ['external', 'third-party', 'api', 'integration'],
            'Security Concerns': ['security', 'auth', 'permission', 'sensitive'],
            'Performance Critical': ['performance', 'fast', 'speed', 'optimization'],
            'Breaking Changes': ['breaking', 'major', 'refactor', 'restructure']
        };
        
        for (const [risk, keywords] of Object.entries(riskPatterns)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                risks.push({
                    type: risk,
                    confidence: 0.7,
                    keywords: keywords.filter(keyword => text.includes(keyword))
                });
            }
        }
        
        return risks;
    }

    /**
     * Calculate task priority
     * @param {string} description - Task description
     * @param {Object} context - Additional context
     * @returns {Object} Priority analysis
     * @private
     */
    _calculatePriority(description, context) {
        let score = 50; // Base score
        const factors = {};
        
        const text = description.toLowerCase();
        
        // Urgency indicators
        const urgencyKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency'];
        const urgencyCount = urgencyKeywords.filter(keyword => text.includes(keyword)).length;
        factors.urgency = urgencyCount;
        score += urgencyCount * 20;
        
        // Business impact indicators
        const impactKeywords = ['revenue', 'customer', 'user', 'business', 'production'];
        const impactCount = impactKeywords.filter(keyword => text.includes(keyword)).length;
        factors.impact = impactCount;
        score += impactCount * 15;
        
        // Context priority
        if (context.priority) {
            const priorityMap = { low: -10, medium: 0, high: 20, critical: 40 };
            score += priorityMap[context.priority] || 0;
            factors.contextPriority = context.priority;
        }
        
        // Determine priority level
        let level = 'medium';
        if (score >= 80) level = 'critical';
        else if (score >= 65) level = 'high';
        else if (score < 40) level = 'low';
        
        return {
            score: Math.max(0, Math.min(100, score)),
            level,
            factors
        };
    }

    /**
     * Calculate requirement confidence
     * @param {string} requirement - Requirement text
     * @returns {number} Confidence score
     * @private
     */
    _calculateRequirementConfidence(requirement) {
        const text = requirement.toLowerCase();
        
        // Strong indicators
        const strongIndicators = ['must', 'should', 'need', 'require', 'implement'];
        const strongCount = strongIndicators.filter(indicator => text.includes(indicator)).length;
        
        // Weak indicators
        const weakIndicators = ['could', 'might', 'maybe', 'possibly'];
        const weakCount = weakIndicators.filter(indicator => text.includes(indicator)).length;
        
        let confidence = 0.6; // Base confidence
        confidence += strongCount * 0.2;
        confidence -= weakCount * 0.2;
        
        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * Get intent description
     * @param {string} intent - Intent type
     * @returns {string} Intent description
     * @private
     */
    _getIntentDescription(intent) {
        const descriptions = {
            create: 'Create new functionality or components',
            modify: 'Modify or update existing functionality',
            delete: 'Remove or clean up existing code',
            test: 'Add or improve testing coverage',
            document: 'Add or update documentation'
        };
        
        return descriptions[intent] || 'General development task';
    }
}

export default TaskAnalyzer;

