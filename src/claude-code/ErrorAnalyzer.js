/**
 * @fileoverview Error Analyzer
 * @description Intelligent error analysis and classification system
 */

/**
 * Error Analyzer for intelligent error classification and analysis
 */
export class ErrorAnalyzer {
    constructor(config = {}) {
        this.config = {
            max_analysis_depth: config.max_analysis_depth || 5,
            pattern_history_limit: config.pattern_history_limit || 100,
            confidence_threshold: config.confidence_threshold || 0.7,
            learning_enabled: config.learning_enabled !== false,
            ...config
        };

        this.errorPatterns = new Map();
        this.analysisHistory = [];
        this.errorClassifications = {
            syntax: {
                patterns: [
                    /SyntaxError/i,
                    /Unexpected token/i,
                    /Missing semicolon/i,
                    /Unterminated string/i,
                    /Invalid or unexpected token/i
                ],
                severity: 'high',
                category: 'compilation'
            },
            dependency: {
                patterns: [
                    /Cannot resolve module/i,
                    /Module not found/i,
                    /ENOTFOUND/i,
                    /peer dep/i,
                    /version conflict/i,
                    /dependency.*not.*found/i
                ],
                severity: 'medium',
                category: 'environment'
            },
            integration: {
                patterns: [
                    /Connection refused/i,
                    /ECONNREFUSED/i,
                    /timeout/i,
                    /API.*error/i,
                    /Service unavailable/i,
                    /Integration.*failed/i
                ],
                severity: 'medium',
                category: 'integration'
            },
            performance: {
                patterns: [
                    /Memory.*exceeded/i,
                    /Timeout/i,
                    /Performance.*budget/i,
                    /Slow.*query/i,
                    /High.*CPU/i,
                    /Memory leak/i
                ],
                severity: 'medium',
                category: 'performance'
            },
            security: {
                patterns: [
                    /Security.*vulnerability/i,
                    /XSS/i,
                    /SQL.*injection/i,
                    /CSRF/i,
                    /Authentication.*failed/i,
                    /Unauthorized/i
                ],
                severity: 'critical',
                category: 'security'
            },
            logic: {
                patterns: [
                    /AssertionError/i,
                    /Test.*failed/i,
                    /Expected.*but.*got/i,
                    /Logic.*error/i,
                    /Business.*rule/i
                ],
                severity: 'high',
                category: 'logic'
            }
        };
    }

    /**
     * Classify errors into categories
     */
    async classifyErrors(errorList) {
        console.log(`🔍 Classifying ${errorList.length} errors...`);
        
        const classification = {
            syntax: [],
            dependency: [],
            integration: [],
            performance: [],
            security: [],
            logic: [],
            unknown: []
        };

        const confidenceScores = {};

        for (const error of errorList) {
            const errorText = this.extractErrorText(error);
            const category = this.categorizeError(errorText);
            const confidence = this.calculateConfidence(errorText, category);
            
            classification[category].push({
                ...error,
                category,
                confidence,
                errorText
            });

            confidenceScores[category] = (confidenceScores[category] || []).concat(confidence);
        }

        // Calculate average confidence per category
        for (const [category, scores] of Object.entries(confidenceScores)) {
            if (scores.length > 0) {
                classification[`${category}_confidence`] = scores.reduce((a, b) => a + b, 0) / scores.length;
            }
        }

        const summary = {
            total: errorList.length,
            by_category: Object.fromEntries(
                Object.entries(classification)
                    .filter(([key]) => !key.endsWith('_confidence'))
                    .map(([key, value]) => [key, value.length])
            ),
            high_confidence: Object.values(classification)
                .flat()
                .filter(e => e && e.confidence > this.config.confidence_threshold).length
        };

        console.log(`✅ Error classification completed:`, summary.by_category);
        
        return {
            classification,
            summary,
            confidenceScores
        };
    }

    /**
     * Perform root cause analysis
     */
    async performRootCauseAnalysis(errors) {
        console.log(`🔬 Performing root cause analysis on ${errors.length} errors...`);
        
        const rootCauses = [];
        const errorGroups = this.groupRelatedErrors(errors);

        for (const group of errorGroups) {
            const rootCause = await this.analyzeErrorGroup(group);
            rootCauses.push(rootCause);
        }

        // Prioritize root causes by impact
        const prioritizedCauses = this.prioritizeRootCauses(rootCauses);

        console.log(`✅ Root cause analysis completed (${rootCauses.length} root causes identified)`);
        
        return {
            rootCauses: prioritizedCauses,
            totalGroups: errorGroups.length,
            analysisDepth: this.config.max_analysis_depth
        };
    }

    /**
     * Identify error patterns from history
     */
    async identifyErrorPatterns(errors, history) {
        console.log(`📊 Identifying error patterns from ${history.length} historical records...`);
        
        const patterns = {
            recurring: [],
            trending: [],
            seasonal: [],
            correlated: []
        };

        // Find recurring patterns
        patterns.recurring = this.findRecurringPatterns(errors, history);
        
        // Find trending patterns
        patterns.trending = this.findTrendingPatterns(errors, history);
        
        // Find seasonal patterns
        patterns.seasonal = this.findSeasonalPatterns(errors, history);
        
        // Find correlated patterns
        patterns.correlated = this.findCorrelatedPatterns(errors, history);

        // Update pattern database
        if (this.config.learning_enabled) {
            this.updatePatternDatabase(patterns);
        }

        console.log(`✅ Pattern identification completed:`, {
            recurring: patterns.recurring.length,
            trending: patterns.trending.length,
            seasonal: patterns.seasonal.length,
            correlated: patterns.correlated.length
        });
        
        return patterns;
    }

    /**
     * Generate fix strategies based on analysis
     */
    async generateFixStrategies(analysis) {
        console.log('🛠️ Generating fix strategies...');
        
        const strategies = [];
        const { classification, rootCauseAnalysis, patterns } = analysis;

        // Generate strategies for each error category
        for (const [category, errors] of Object.entries(classification.classification)) {
            if (errors.length > 0 && category !== 'unknown') {
                const categoryStrategies = this.generateCategoryStrategies(category, errors);
                strategies.push(...categoryStrategies);
            }
        }

        // Generate strategies based on root causes
        if (rootCauseAnalysis?.rootCauses) {
            for (const rootCause of rootCauseAnalysis.rootCauses) {
                const rootCauseStrategies = this.generateRootCauseStrategies(rootCause);
                strategies.push(...rootCauseStrategies);
            }
        }

        // Generate strategies based on patterns
        if (patterns?.recurring) {
            for (const pattern of patterns.recurring) {
                const patternStrategies = this.generatePatternStrategies(pattern);
                strategies.push(...patternStrategies);
            }
        }

        // Prioritize and deduplicate strategies
        const prioritizedStrategies = this.prioritizeFixStrategies(strategies);

        console.log(`✅ Generated ${prioritizedStrategies.length} fix strategies`);
        
        return prioritizedStrategies;
    }

    /**
     * Prioritize fix attempts based on impact and complexity
     */
    async prioritizeFixAttempts(strategies) {
        console.log(`📋 Prioritizing ${strategies.length} fix attempts...`);
        
        const prioritized = strategies.map(strategy => ({
            ...strategy,
            priority_score: this.calculatePriorityScore(strategy)
        })).sort((a, b) => b.priority_score - a.priority_score);

        const priorityGroups = {
            critical: prioritized.filter(s => s.priority_score >= 90),
            high: prioritized.filter(s => s.priority_score >= 70 && s.priority_score < 90),
            medium: prioritized.filter(s => s.priority_score >= 50 && s.priority_score < 70),
            low: prioritized.filter(s => s.priority_score < 50)
        };

        console.log(`✅ Fix attempts prioritized:`, {
            critical: priorityGroups.critical.length,
            high: priorityGroups.high.length,
            medium: priorityGroups.medium.length,
            low: priorityGroups.low.length
        });
        
        return {
            prioritized,
            groups: priorityGroups,
            execution_order: [
                ...priorityGroups.critical,
                ...priorityGroups.high,
                ...priorityGroups.medium,
                ...priorityGroups.low
            ]
        };
    }

    /**
     * Track fix success rates
     */
    async trackFixSuccess(attempts, outcomes) {
        console.log(`📈 Tracking success of ${attempts.length} fix attempts...`);
        
        const successMetrics = {
            total_attempts: attempts.length,
            successful: 0,
            failed: 0,
            partial: 0,
            success_rate: 0,
            by_category: {},
            by_strategy: {},
            learning_data: []
        };

        for (let i = 0; i < attempts.length; i++) {
            const attempt = attempts[i];
            const outcome = outcomes[i];
            
            // Track overall success
            if (outcome.success) {
                successMetrics.successful++;
            } else if (outcome.partial) {
                successMetrics.partial++;
            } else {
                successMetrics.failed++;
            }

            // Track by category
            const category = attempt.category || 'unknown';
            if (!successMetrics.by_category[category]) {
                successMetrics.by_category[category] = { attempts: 0, successful: 0 };
            }
            successMetrics.by_category[category].attempts++;
            if (outcome.success) {
                successMetrics.by_category[category].successful++;
            }

            // Track by strategy
            const strategy = attempt.strategy || 'unknown';
            if (!successMetrics.by_strategy[strategy]) {
                successMetrics.by_strategy[strategy] = { attempts: 0, successful: 0 };
            }
            successMetrics.by_strategy[strategy].attempts++;
            if (outcome.success) {
                successMetrics.by_strategy[strategy].successful++;
            }

            // Collect learning data
            successMetrics.learning_data.push({
                attempt,
                outcome,
                timestamp: Date.now()
            });
        }

        // Calculate success rates
        successMetrics.success_rate = (successMetrics.successful / successMetrics.total_attempts) * 100;
        
        for (const category of Object.keys(successMetrics.by_category)) {
            const data = successMetrics.by_category[category];
            data.success_rate = (data.successful / data.attempts) * 100;
        }
        
        for (const strategy of Object.keys(successMetrics.by_strategy)) {
            const data = successMetrics.by_strategy[strategy];
            data.success_rate = (data.successful / data.attempts) * 100;
        }

        // Update learning models if enabled
        if (this.config.learning_enabled) {
            this.updateLearningModels(successMetrics.learning_data);
        }

        console.log(`✅ Fix success tracking completed (${successMetrics.success_rate.toFixed(1)}% success rate)`);
        
        return successMetrics;
    }

    /**
     * Helper methods for error analysis
     */

    extractErrorText(error) {
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (error.error) return error.error;
        if (error.description) return error.description;
        return JSON.stringify(error);
    }

    categorizeError(errorText) {
        for (const [category, config] of Object.entries(this.errorClassifications)) {
            for (const pattern of config.patterns) {
                if (pattern.test(errorText)) {
                    return category;
                }
            }
        }
        return 'unknown';
    }

    calculateConfidence(errorText, category) {
        if (category === 'unknown') return 0;
        
        const config = this.errorClassifications[category];
        let matchCount = 0;
        
        for (const pattern of config.patterns) {
            if (pattern.test(errorText)) {
                matchCount++;
            }
        }
        
        return Math.min(matchCount / config.patterns.length, 1);
    }

    groupRelatedErrors(errors) {
        const groups = [];
        const processed = new Set();

        for (let i = 0; i < errors.length; i++) {
            if (processed.has(i)) continue;

            const group = [errors[i]];
            processed.add(i);

            // Find related errors
            for (let j = i + 1; j < errors.length; j++) {
                if (processed.has(j)) continue;

                if (this.areErrorsRelated(errors[i], errors[j])) {
                    group.push(errors[j]);
                    processed.add(j);
                }
            }

            groups.push(group);
        }

        return groups;
    }

    areErrorsRelated(error1, error2) {
        const text1 = this.extractErrorText(error1).toLowerCase();
        const text2 = this.extractErrorText(error2).toLowerCase();
        
        // Check for common keywords
        const keywords1 = text1.split(/\s+/).filter(w => w.length > 3);
        const keywords2 = text2.split(/\s+/).filter(w => w.length > 3);
        
        const commonKeywords = keywords1.filter(k => keywords2.includes(k));
        
        return commonKeywords.length >= 2;
    }

    async analyzeErrorGroup(group) {
        const rootCause = {
            id: `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            errors: group,
            primary_error: group[0],
            category: this.categorizeError(this.extractErrorText(group[0])),
            impact: this.calculateImpact(group),
            likelihood: this.calculateLikelihood(group),
            description: this.generateRootCauseDescription(group),
            potential_fixes: this.generatePotentialFixes(group)
        };

        return rootCause;
    }

    calculateImpact(errorGroup) {
        // Calculate impact based on error severity and count
        const severityWeights = { critical: 10, high: 7, medium: 4, low: 1 };
        let totalImpact = 0;

        for (const error of errorGroup) {
            const category = this.categorizeError(this.extractErrorText(error));
            const severity = this.errorClassifications[category]?.severity || 'low';
            totalImpact += severityWeights[severity] || 1;
        }

        return Math.min(totalImpact, 100);
    }

    calculateLikelihood(errorGroup) {
        // Calculate likelihood based on error frequency and patterns
        return Math.min(errorGroup.length * 10, 100);
    }

    generateRootCauseDescription(errorGroup) {
        const primaryError = this.extractErrorText(errorGroup[0]);
        const category = this.categorizeError(primaryError);
        
        return `${category} issue affecting ${errorGroup.length} component(s): ${primaryError.substring(0, 100)}...`;
    }

    generatePotentialFixes(errorGroup) {
        const category = this.categorizeError(this.extractErrorText(errorGroup[0]));
        
        const fixTemplates = {
            syntax: [
                'Fix syntax errors in affected files',
                'Run linter to identify and fix formatting issues',
                'Check for missing semicolons or brackets'
            ],
            dependency: [
                'Update package dependencies',
                'Resolve version conflicts',
                'Install missing dependencies'
            ],
            integration: [
                'Check service connectivity',
                'Verify API endpoints',
                'Update integration configurations'
            ],
            performance: [
                'Optimize resource usage',
                'Implement caching strategies',
                'Review algorithm efficiency'
            ],
            security: [
                'Apply security patches',
                'Update vulnerable dependencies',
                'Implement security best practices'
            ],
            logic: [
                'Review business logic implementation',
                'Update test cases',
                'Verify requirement specifications'
            ]
        };

        return fixTemplates[category] || ['Manual investigation required'];
    }

    prioritizeRootCauses(rootCauses) {
        return rootCauses.sort((a, b) => {
            // Prioritize by impact first, then likelihood
            if (a.impact !== b.impact) {
                return b.impact - a.impact;
            }
            return b.likelihood - a.likelihood;
        });
    }

    findRecurringPatterns(errors, history) {
        const patterns = [];
        const errorTexts = errors.map(e => this.extractErrorText(e));
        
        // Simple pattern detection - look for similar errors in history
        for (const errorText of errorTexts) {
            const occurrences = history.filter(h => 
                h.errors && h.errors.some(e => 
                    this.extractErrorText(e).includes(errorText.substring(0, 50))
                )
            ).length;
            
            if (occurrences >= 3) {
                patterns.push({
                    pattern: errorText.substring(0, 100),
                    occurrences,
                    type: 'recurring'
                });
            }
        }
        
        return patterns;
    }

    findTrendingPatterns(errors, history) {
        // Placeholder for trending pattern detection
        return [];
    }

    findSeasonalPatterns(errors, history) {
        // Placeholder for seasonal pattern detection
        return [];
    }

    findCorrelatedPatterns(errors, history) {
        // Placeholder for correlation pattern detection
        return [];
    }

    updatePatternDatabase(patterns) {
        // Update internal pattern database for learning
        for (const [type, patternList] of Object.entries(patterns)) {
            if (!this.errorPatterns.has(type)) {
                this.errorPatterns.set(type, []);
            }
            this.errorPatterns.get(type).push(...patternList);
        }
    }

    generateCategoryStrategies(category, errors) {
        const strategies = [];
        
        const strategyTemplates = {
            syntax: [
                {
                    strategy: 'automated_syntax_fix',
                    description: 'Apply automated syntax corrections',
                    complexity: 'low',
                    success_rate: 0.9,
                    estimated_time: 5
                }
            ],
            dependency: [
                {
                    strategy: 'dependency_update',
                    description: 'Update and resolve dependencies',
                    complexity: 'medium',
                    success_rate: 0.8,
                    estimated_time: 15
                }
            ],
            integration: [
                {
                    strategy: 'integration_retry',
                    description: 'Retry failed integrations with backoff',
                    complexity: 'low',
                    success_rate: 0.7,
                    estimated_time: 10
                }
            ]
        };

        const templates = strategyTemplates[category] || [];
        
        for (const template of templates) {
            strategies.push({
                ...template,
                category,
                errors: errors.length,
                id: `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });
        }

        return strategies;
    }

    generateRootCauseStrategies(rootCause) {
        return rootCause.potential_fixes.map((fix, index) => ({
            id: `rc_strategy_${rootCause.id}_${index}`,
            strategy: 'root_cause_fix',
            description: fix,
            category: rootCause.category,
            complexity: 'medium',
            success_rate: 0.75,
            estimated_time: 20,
            root_cause_id: rootCause.id
        }));
    }

    generatePatternStrategies(pattern) {
        return [{
            id: `pattern_strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            strategy: 'pattern_based_fix',
            description: `Apply fix based on recurring pattern: ${pattern.pattern}`,
            category: 'pattern',
            complexity: 'medium',
            success_rate: 0.8,
            estimated_time: 15,
            pattern_id: pattern.pattern
        }];
    }

    prioritizeFixStrategies(strategies) {
        return strategies
            .map(strategy => ({
                ...strategy,
                priority_score: this.calculatePriorityScore(strategy)
            }))
            .sort((a, b) => b.priority_score - a.priority_score)
            .slice(0, 20); // Limit to top 20 strategies
    }

    calculatePriorityScore(strategy) {
        let score = 0;
        
        // Success rate weight (40%)
        score += (strategy.success_rate || 0.5) * 40;
        
        // Complexity weight (30% - lower complexity = higher score)
        const complexityScores = { low: 30, medium: 20, high: 10 };
        score += complexityScores[strategy.complexity] || 15;
        
        // Time weight (20% - less time = higher score)
        const timeScore = Math.max(20 - (strategy.estimated_time || 30) / 5, 0);
        score += timeScore;
        
        // Error count weight (10%)
        score += Math.min((strategy.errors || 1) * 2, 10);
        
        return Math.round(score);
    }

    updateLearningModels(learningData) {
        // Update machine learning models with success/failure data
        this.analysisHistory.push(...learningData);
        
        // Keep history within limits
        if (this.analysisHistory.length > this.config.pattern_history_limit) {
            this.analysisHistory = this.analysisHistory.slice(-this.config.pattern_history_limit);
        }
    }
}

export default ErrorAnalyzer;

