/**
 * @fileoverview Unified Task Analyzer
 * @description Consolidated natural language processing from PRs #54, #55, #86
 */

import { log } from '../../../utils/logger.js';

/**
 * Task analysis error
 */
export class TaskAnalysisError extends Error {
    constructor(message, code = null) {
        super(message);
        this.name = 'TaskAnalysisError';
        this.code = code;
    }
}

/**
 * Unified Task Analyzer
 * Consolidates NLP patterns from multiple PRs
 */
export class TaskAnalyzer {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            maxContextLength: config.maxContextLength || 8000,
            confidenceThreshold: config.confidenceThreshold || 0.7,
            enableSemanticAnalysis: config.enableSemanticAnalysis !== false,
            enableIntentClassification: config.enableIntentClassification !== false,
            enableComplexityAnalysis: config.enableComplexityAnalysis !== false,
            supportedTaskTypes: config.supportedTaskTypes || [
                'feature_implementation',
                'bug_fix',
                'code_refactor',
                'documentation',
                'testing',
                'optimization',
                'security_fix'
            ],
            supportedLanguages: config.supportedLanguages || [
                'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
            ],
            ...config
        };

        // Initialize analysis patterns
        this.intentPatterns = this._initializeIntentPatterns();
        this.complexityFactors = this._initializeComplexityFactors();
        this.requirementPatterns = this._initializeRequirementPatterns();
        
        log('debug', 'Task Analyzer initialized', {
            enabled: this.config.enabled,
            supportedTypes: this.config.supportedTaskTypes.length,
            supportedLanguages: this.config.supportedLanguages.length
        });
    }

    /**
     * Initialize the analyzer
     * @returns {Promise<void>}
     */
    async initialize() {
        if (!this.config.enabled) {
            log('info', 'Task Analyzer disabled');
            return;
        }

        log('info', 'Initializing Task Analyzer...');
        
        // Pre-compile regex patterns for performance
        this._compilePatterns();
        
        log('info', 'Task Analyzer initialized successfully');
    }

    /**
     * Analyze a natural language task
     * @param {string} description - Task description
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Analysis result
     */
    async analyzeTask(description, context = {}) {
        try {
            log('debug', 'Analyzing task', { 
                descriptionLength: description.length,
                hasContext: !!context 
            });

            // Validate input
            this._validateInput(description);

            // Perform analysis
            const analysis = {
                originalDescription: description,
                context,
                timestamp: new Date().toISOString()
            };

            // Intent classification
            if (this.config.enableIntentClassification) {
                analysis.intent = await this._analyzeIntent(description, context);
            }

            // Complexity analysis
            if (this.config.enableComplexityAnalysis) {
                analysis.complexity = await this._analyzeComplexity(description, context);
            }

            // Requirement extraction
            analysis.requirements = await this._extractRequirements(description, context);

            // Technology detection
            analysis.technologies = await this._detectTechnologies(description, context);

            // Scope analysis
            analysis.scope = await this._analyzeScope(description, context, analysis);

            // Risk assessment
            analysis.riskFactors = await this._assessRisks(description, context, analysis);

            // Priority calculation
            analysis.priority = await this._calculatePriority(description, context, analysis);

            // Generate summary
            analysis.summary = this._generateSummary(analysis);

            log('debug', 'Task analysis completed', {
                intent: analysis.intent?.primary,
                complexity: analysis.complexity?.level,
                confidence: analysis.intent?.confidence
            });

            return analysis;

        } catch (error) {
            log('error', 'Task analysis failed', { error: error.message });
            throw new TaskAnalysisError(`Analysis failed: ${error.message}`, 'ANALYSIS_FAILED');
        }
    }

    /**
     * Analyze intent from description
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Intent analysis
     * @private
     */
    async _analyzeIntent(description, context) {
        const text = description.toLowerCase();
        const intents = [];

        // Check for primary intent patterns
        for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
            let confidence = 0;
            let matches = 0;

            for (const pattern of patterns) {
                if (pattern.test(text)) {
                    matches++;
                    confidence += 0.2; // Each match adds confidence
                }
            }

            if (matches > 0) {
                intents.push({
                    intent,
                    confidence: Math.min(confidence, 1.0),
                    matches
                });
            }
        }

        // Sort by confidence
        intents.sort((a, b) => b.confidence - a.confidence);

        // Determine primary intent
        const primary = intents[0] || { intent: 'unknown', confidence: 0 };

        return {
            primary: primary.intent,
            confidence: primary.confidence,
            alternatives: intents.slice(1, 3), // Top 2 alternatives
            description: this._getIntentDescription(primary.intent)
        };
    }

    /**
     * Analyze complexity of the task
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Complexity analysis
     * @private
     */
    async _analyzeComplexity(description, context) {
        let score = 0;
        const factors = [];

        // Analyze various complexity factors
        for (const [factor, config] of Object.entries(this.complexityFactors)) {
            const factorScore = this._calculateFactorScore(description, factor, config);
            if (factorScore > 0) {
                score += factorScore * config.weight;
                factors.push({
                    factor,
                    score: factorScore,
                    weight: config.weight,
                    contribution: factorScore * config.weight
                });
            }
        }

        // Determine complexity level
        let level;
        if (score <= 3) {
            level = 'simple';
        } else if (score <= 7) {
            level = 'medium';
        } else {
            level = 'complex';
        }

        // Estimate effort
        const estimatedHours = this._estimateEffort(score, level);
        const estimatedLines = this._estimateLines(score, level);
        const estimatedFiles = this._estimateFiles(score, level);

        return {
            level,
            score: Math.round(score * 10) / 10,
            factors,
            estimatedHours,
            estimatedLines,
            estimatedFiles,
            description: this._getComplexityDescription(level, score)
        };
    }

    /**
     * Extract requirements from description
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Requirements
     * @private
     */
    async _extractRequirements(description, context) {
        const requirements = {
            functional: [],
            nonFunctional: {},
            technical: {},
            business: {},
            constraints: {}
        };

        // Extract functional requirements
        requirements.functional = this._extractFunctionalRequirements(description);

        // Extract non-functional requirements
        requirements.nonFunctional = this._extractNonFunctionalRequirements(description);

        // Extract technical requirements
        requirements.technical = this._extractTechnicalRequirements(description, context);

        // Extract business requirements
        requirements.business = this._extractBusinessRequirements(description);

        // Extract constraints
        requirements.constraints = this._extractConstraints(description);

        return requirements;
    }

    /**
     * Detect technologies mentioned in description
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Technology detection
     * @private
     */
    async _detectTechnologies(description, context) {
        const text = description.toLowerCase();
        const technologies = {
            languages: [],
            frameworks: [],
            databases: [],
            tools: [],
            platforms: []
        };

        // Language detection
        const languagePatterns = {
            javascript: /\b(javascript|js|node\.?js|npm|yarn)\b/,
            typescript: /\b(typescript|ts)\b/,
            python: /\b(python|py|pip|django|flask|fastapi)\b/,
            java: /\b(java|spring|maven|gradle)\b/,
            go: /\b(go|golang)\b/,
            rust: /\b(rust|cargo)\b/,
            php: /\b(php|composer|laravel|symfony)\b/,
            ruby: /\b(ruby|rails|gem)\b/
        };

        for (const [lang, pattern] of Object.entries(languagePatterns)) {
            if (pattern.test(text)) {
                technologies.languages.push({
                    name: lang,
                    confidence: 0.8
                });
            }
        }

        // Framework detection
        const frameworkPatterns = {
            react: /\b(react|jsx|next\.?js)\b/,
            vue: /\b(vue|nuxt)\b/,
            angular: /\b(angular|ng)\b/,
            express: /\b(express|express\.js)\b/,
            django: /\b(django)\b/,
            rails: /\b(rails|ruby on rails)\b/
        };

        for (const [framework, pattern] of Object.entries(frameworkPatterns)) {
            if (pattern.test(text)) {
                technologies.frameworks.push({
                    name: framework,
                    confidence: 0.7
                });
            }
        }

        // Add context-based technologies
        if (context.language) {
            technologies.languages.push({
                name: context.language,
                confidence: 0.9,
                source: 'context'
            });
        }

        if (context.framework) {
            technologies.frameworks.push({
                name: context.framework,
                confidence: 0.9,
                source: 'context'
            });
        }

        return technologies;
    }

    /**
     * Analyze scope of the task
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @param {Object} analysis - Current analysis
     * @returns {Promise<Object>} Scope analysis
     * @private
     */
    async _analyzeScope(description, context, analysis) {
        const complexity = analysis.complexity || { score: 5 };
        
        // Determine scope size
        let size;
        if (complexity.score <= 3) {
            size = 'small';
        } else if (complexity.score <= 7) {
            size = 'medium';
        } else {
            size = 'large';
        }

        // Identify affected areas
        const affectedAreas = this._identifyAffectedAreas(description);

        return {
            size,
            affectedAreas,
            estimatedFiles: complexity.estimatedFiles || 1,
            estimatedLines: complexity.estimatedLines || 50,
            description: this._getScopeDescription(size, affectedAreas)
        };
    }

    /**
     * Assess risk factors
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @param {Object} analysis - Current analysis
     * @returns {Promise<Array>} Risk factors
     * @private
     */
    async _assessRisks(description, context, analysis) {
        const risks = [];
        const text = description.toLowerCase();

        // High complexity risk
        if (analysis.complexity?.score > 8) {
            risks.push({
                type: 'complexity',
                level: 'high',
                description: 'High complexity may lead to implementation challenges',
                mitigation: 'Break down into smaller tasks'
            });
        }

        // Security-related risks
        if (/\b(auth|security|password|token|encrypt)\b/.test(text)) {
            risks.push({
                type: 'security',
                level: 'medium',
                description: 'Security-related changes require careful review',
                mitigation: 'Conduct security review and testing'
            });
        }

        // Database-related risks
        if (/\b(database|db|sql|migration|schema)\b/.test(text)) {
            risks.push({
                type: 'data',
                level: 'medium',
                description: 'Database changes may affect data integrity',
                mitigation: 'Test with backup data and plan rollback strategy'
            });
        }

        // API changes
        if (/\b(api|endpoint|interface|breaking)\b/.test(text)) {
            risks.push({
                type: 'compatibility',
                level: 'medium',
                description: 'API changes may break existing integrations',
                mitigation: 'Ensure backward compatibility or plan migration'
            });
        }

        return risks;
    }

    /**
     * Calculate task priority
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @param {Object} analysis - Current analysis
     * @returns {Promise<Object>} Priority analysis
     * @private
     */
    async _calculatePriority(description, context, analysis) {
        let score = 50; // Base score
        const factors = {};

        // Urgency indicators
        const urgencyPatterns = {
            critical: /\b(critical|urgent|asap|immediately|emergency)\b/,
            high: /\b(important|priority|soon|needed)\b/,
            bug: /\b(bug|error|fix|broken|issue)\b/,
            security: /\b(security|vulnerability|exploit)\b/
        };

        for (const [type, pattern] of Object.entries(urgencyPatterns)) {
            if (pattern.test(description.toLowerCase())) {
                const boost = type === 'critical' ? 30 : type === 'security' ? 25 : 
                             type === 'bug' ? 20 : 15;
                score += boost;
                factors[type] = boost;
            }
        }

        // Context priority
        if (context.priority) {
            const priorityBoost = {
                critical: 40,
                high: 25,
                medium: 10,
                low: -10
            };
            const boost = priorityBoost[context.priority] || 0;
            score += boost;
            factors.contextPriority = boost;
        }

        // Complexity factor (higher complexity = higher priority for planning)
        if (analysis.complexity) {
            const complexityBoost = analysis.complexity.score * 2;
            score += complexityBoost;
            factors.complexity = complexityBoost;
        }

        // Normalize score to 0-100
        score = Math.max(0, Math.min(100, score));

        // Determine level
        let level;
        if (score >= 80) {
            level = 'critical';
        } else if (score >= 60) {
            level = 'high';
        } else if (score >= 40) {
            level = 'medium';
        } else {
            level = 'low';
        }

        return {
            score: Math.round(score),
            level,
            factors,
            description: this._getPriorityDescription(level, score)
        };
    }

    /**
     * Generate analysis summary
     * @param {Object} analysis - Complete analysis
     * @returns {Object} Summary
     * @private
     */
    _generateSummary(analysis) {
        return {
            intent: analysis.intent?.primary || 'unknown',
            complexity: analysis.complexity?.level || 'medium',
            priority: analysis.priority?.level || 'medium',
            estimatedEffort: analysis.complexity?.estimatedHours || 4,
            riskLevel: analysis.riskFactors?.length > 2 ? 'high' : 
                      analysis.riskFactors?.length > 0 ? 'medium' : 'low',
            technologies: analysis.technologies?.languages?.map(l => l.name) || [],
            confidence: analysis.intent?.confidence || 0.5
        };
    }

    /**
     * Initialize intent patterns
     * @returns {Object} Intent patterns
     * @private
     */
    _initializeIntentPatterns() {
        return {
            create: [
                /\b(create|add|implement|build|develop|make|generate)\b/,
                /\b(new|fresh|from scratch)\b/
            ],
            modify: [
                /\b(modify|change|update|edit|alter|adjust)\b/,
                /\b(improve|enhance|extend)\b/
            ],
            fix: [
                /\b(fix|repair|resolve|solve|debug)\b/,
                /\b(bug|error|issue|problem)\b/
            ],
            refactor: [
                /\b(refactor|restructure|reorganize|cleanup)\b/,
                /\b(optimize|improve performance)\b/
            ],
            delete: [
                /\b(delete|remove|eliminate|drop)\b/,
                /\b(clean up|get rid of)\b/
            ],
            test: [
                /\b(test|testing|spec|unit test|integration test)\b/,
                /\b(coverage|qa|quality assurance)\b/
            ],
            document: [
                /\b(document|documentation|readme|guide)\b/,
                /\b(comment|explain|describe)\b/
            ]
        };
    }

    /**
     * Initialize complexity factors
     * @returns {Object} Complexity factors
     * @private
     */
    _initializeComplexityFactors() {
        return {
            entities: {
                weight: 0.3,
                patterns: [/\b(user|customer|product|order|payment|account)\b/g]
            },
            actions: {
                weight: 0.5,
                patterns: [/\b(create|read|update|delete|process|validate|send|receive)\b/g]
            },
            integrations: {
                weight: 0.7,
                patterns: [/\b(api|service|integration|webhook|third.?party)\b/g]
            },
            security: {
                weight: 0.8,
                patterns: [/\b(auth|security|permission|encrypt|token|oauth)\b/g]
            },
            database: {
                weight: 0.6,
                patterns: [/\b(database|db|sql|migration|schema|query)\b/g]
            },
            ui: {
                weight: 0.4,
                patterns: [/\b(ui|interface|component|form|page|view)\b/g]
            }
        };
    }

    /**
     * Initialize requirement patterns
     * @returns {Object} Requirement patterns
     * @private
     */
    _initializeRequirementPatterns() {
        return {
            functional: [
                /\b(should|must|shall|will|need to|required to)\b/,
                /\b(function|feature|capability|behavior)\b/
            ],
            performance: [
                /\b(fast|quick|performance|speed|latency|response time)\b/,
                /\b(scalable|efficient|optimize)\b/
            ],
            security: [
                /\b(secure|safety|protect|encrypt|auth)\b/,
                /\b(permission|access control|vulnerability)\b/
            ],
            usability: [
                /\b(user.?friendly|easy|simple|intuitive)\b/,
                /\b(accessible|usable|ux|user experience)\b/
            ]
        };
    }

    /**
     * Compile regex patterns for performance
     * @private
     */
    _compilePatterns() {
        // Convert string patterns to RegExp objects
        for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
            this.intentPatterns[intent] = patterns.map(p => 
                typeof p === 'string' ? new RegExp(p, 'i') : p
            );
        }
    }

    /**
     * Validate input
     * @param {string} description - Description to validate
     * @private
     */
    _validateInput(description) {
        if (!description || typeof description !== 'string') {
            throw new TaskAnalysisError('Description is required and must be a string', 'INVALID_INPUT');
        }

        if (description.length < 10) {
            throw new TaskAnalysisError('Description must be at least 10 characters', 'DESCRIPTION_TOO_SHORT');
        }

        if (description.length > this.config.maxContextLength) {
            throw new TaskAnalysisError(
                `Description must be less than ${this.config.maxContextLength} characters`, 
                'DESCRIPTION_TOO_LONG'
            );
        }
    }

    /**
     * Calculate factor score
     * @param {string} description - Task description
     * @param {string} factor - Factor name
     * @param {Object} config - Factor configuration
     * @returns {number} Factor score
     * @private
     */
    _calculateFactorScore(description, factor, config) {
        let score = 0;
        
        for (const pattern of config.patterns) {
            const matches = description.match(pattern) || [];
            score += matches.length;
        }
        
        return Math.min(score, 5); // Cap at 5
    }

    /**
     * Extract functional requirements
     * @param {string} description - Task description
     * @returns {Array} Functional requirements
     * @private
     */
    _extractFunctionalRequirements(description) {
        const requirements = [];
        const sentences = description.split(/[.!?]+/);
        
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed.length > 10) {
                // Check if sentence contains requirement indicators
                if (/\b(should|must|shall|will|need|require)\b/i.test(trimmed)) {
                    requirements.push({
                        text: trimmed,
                        type: 'explicit',
                        confidence: 0.8
                    });
                }
            }
        }
        
        return requirements;
    }

    /**
     * Extract non-functional requirements
     * @param {string} description - Task description
     * @returns {Object} Non-functional requirements
     * @private
     */
    _extractNonFunctionalRequirements(description) {
        const text = description.toLowerCase();
        const requirements = {};

        // Performance requirements
        if (/\b(fast|quick|performance|speed|latency)\b/.test(text)) {
            requirements.performance = [{ detected: true, confidence: 0.7 }];
        }

        // Security requirements
        if (/\b(secure|security|auth|encrypt|protect)\b/.test(text)) {
            requirements.security = [{ detected: true, confidence: 0.8 }];
        }

        // Scalability requirements
        if (/\b(scalable|scale|growth|load)\b/.test(text)) {
            requirements.scalability = [{ detected: true, confidence: 0.7 }];
        }

        // Reliability requirements
        if (/\b(reliable|stability|uptime|available)\b/.test(text)) {
            requirements.reliability = [{ detected: true, confidence: 0.7 }];
        }

        return requirements;
    }

    /**
     * Extract technical requirements
     * @param {string} description - Task description
     * @param {Object} context - Context information
     * @returns {Object} Technical requirements
     * @private
     */
    _extractTechnicalRequirements(description, context) {
        const requirements = {};
        
        // Add context-based requirements
        if (context.language) {
            requirements.language = context.language;
        }
        
        if (context.framework) {
            requirements.framework = context.framework;
        }
        
        return requirements;
    }

    /**
     * Extract business requirements
     * @param {string} description - Task description
     * @returns {Object} Business requirements
     * @private
     */
    _extractBusinessRequirements(description) {
        const requirements = {};
        const text = description.toLowerCase();

        // Revenue impact
        if (/\b(revenue|profit|cost|money|business)\b/.test(text)) {
            requirements.businessImpact = { detected: true, confidence: 0.6 };
        }

        // User impact
        if (/\b(user|customer|client|experience)\b/.test(text)) {
            requirements.userImpact = { detected: true, confidence: 0.7 };
        }

        return requirements;
    }

    /**
     * Extract constraints
     * @param {string} description - Task description
     * @returns {Object} Constraints
     * @private
     */
    _extractConstraints(description) {
        const constraints = {};
        const text = description.toLowerCase();

        // Time constraints
        if (/\b(deadline|urgent|asap|by|before)\b/.test(text)) {
            constraints.time = { detected: true, confidence: 0.7 };
        }

        // Budget constraints
        if (/\b(budget|cost|cheap|expensive|free)\b/.test(text)) {
            constraints.budget = { detected: true, confidence: 0.6 };
        }

        // Technology constraints
        if (/\b(must use|required|only|cannot use)\b/.test(text)) {
            constraints.technology = { detected: true, confidence: 0.8 };
        }

        return constraints;
    }

    /**
     * Identify affected areas
     * @param {string} description - Task description
     * @returns {Array} Affected areas
     * @private
     */
    _identifyAffectedAreas(description) {
        const areas = [];
        const text = description.toLowerCase();

        const areaPatterns = {
            frontend: /\b(ui|interface|component|page|view|frontend|client)\b/,
            backend: /\b(api|server|backend|service|endpoint)\b/,
            database: /\b(database|db|data|storage|migration)\b/,
            auth: /\b(auth|login|security|permission|access)\b/,
            testing: /\b(test|testing|spec|qa|quality)\b/,
            documentation: /\b(doc|documentation|readme|guide)\b/
        };

        for (const [area, pattern] of Object.entries(areaPatterns)) {
            if (pattern.test(text)) {
                areas.push(area);
            }
        }

        return areas;
    }

    /**
     * Estimate effort in hours
     * @param {number} score - Complexity score
     * @param {string} level - Complexity level
     * @returns {number} Estimated hours
     * @private
     */
    _estimateEffort(score, level) {
        const baseHours = {
            simple: 2,
            medium: 8,
            complex: 20
        };
        
        return Math.round(baseHours[level] * (1 + score / 10));
    }

    /**
     * Estimate lines of code
     * @param {number} score - Complexity score
     * @param {string} level - Complexity level
     * @returns {number} Estimated lines
     * @private
     */
    _estimateLines(score, level) {
        const baseLines = {
            simple: 50,
            medium: 200,
            complex: 500
        };
        
        return Math.round(baseLines[level] * (1 + score / 10));
    }

    /**
     * Estimate number of files
     * @param {number} score - Complexity score
     * @param {string} level - Complexity level
     * @returns {number} Estimated files
     * @private
     */
    _estimateFiles(score, level) {
        const baseFiles = {
            simple: 1,
            medium: 3,
            complex: 8
        };
        
        return Math.round(baseFiles[level] * (1 + score / 15));
    }

    /**
     * Get intent description
     * @param {string} intent - Intent type
     * @returns {string} Description
     * @private
     */
    _getIntentDescription(intent) {
        const descriptions = {
            create: 'Create new functionality or components',
            modify: 'Modify existing functionality',
            fix: 'Fix bugs or resolve issues',
            refactor: 'Refactor or optimize existing code',
            delete: 'Remove or clean up code',
            test: 'Add or improve testing',
            document: 'Add or improve documentation',
            unknown: 'Intent could not be determined'
        };
        
        return descriptions[intent] || descriptions.unknown;
    }

    /**
     * Get complexity description
     * @param {string} level - Complexity level
     * @param {number} score - Complexity score
     * @returns {string} Description
     * @private
     */
    _getComplexityDescription(level, score) {
        const descriptions = {
            simple: 'Simple task with minimal complexity',
            medium: 'Moderate complexity requiring careful planning',
            complex: 'High complexity requiring significant effort and expertise'
        };
        
        return descriptions[level] || descriptions.medium;
    }

    /**
     * Get scope description
     * @param {string} size - Scope size
     * @param {Array} areas - Affected areas
     * @returns {string} Description
     * @private
     */
    _getScopeDescription(size, areas) {
        const areaText = areas.length > 0 ? ` affecting ${areas.join(', ')}` : '';
        return `${size} scope task${areaText}`;
    }

    /**
     * Get priority description
     * @param {string} level - Priority level
     * @param {number} score - Priority score
     * @returns {string} Description
     * @private
     */
    _getPriorityDescription(level, score) {
        const descriptions = {
            critical: 'Critical priority requiring immediate attention',
            high: 'High priority should be addressed soon',
            medium: 'Medium priority can be scheduled normally',
            low: 'Low priority can be deferred if needed'
        };
        
        return descriptions[level] || descriptions.medium;
    }
}

