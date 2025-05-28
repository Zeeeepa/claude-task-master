/**
 * @fileoverview Result Processor for Validation Results
 * @description Processes validation results and generates error contexts for Codegen
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Result Processor for comprehensive validation result analysis and error context generation
 */
export class ResultProcessor {
    constructor(config = {}) {
        this.config = {
            enable_detailed_analysis: config.enable_detailed_analysis !== false,
            enable_error_categorization: config.enable_error_categorization !== false,
            enable_fix_suggestions: config.enable_fix_suggestions !== false,
            max_error_contexts: config.max_error_contexts || 50,
            error_severity_threshold: config.error_severity_threshold || 'medium',
            ...config
        };

        this.errorCategories = {
            SYNTAX: 'syntax',
            LOGIC: 'logic',
            SECURITY: 'security',
            PERFORMANCE: 'performance',
            TESTING: 'testing',
            DEPENDENCY: 'dependency',
            STYLE: 'style',
            DOCUMENTATION: 'documentation'
        };

        this.severityLevels = {
            CRITICAL: 'critical',
            HIGH: 'high',
            MEDIUM: 'medium',
            LOW: 'low',
            INFO: 'info'
        };
    }

    /**
     * Process comprehensive validation result
     * @param {Object} validationResult - Raw validation result from pipeline
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @param {string} validationId - Validation ID
     * @returns {Promise<Object>} Processed validation result
     */
    async processValidationResult(validationResult, prData, taskContext, validationId) {
        log('debug', `Processing validation result for ${validationId}`);
        
        try {
            // Extract and categorize errors
            const categorizedErrors = await this.categorizeErrors(validationResult, prData, taskContext);
            
            // Generate error contexts for Codegen
            const errorContexts = await this.generateCodegenErrorContexts(
                categorizedErrors, 
                prData, 
                taskContext, 
                validationId
            );
            
            // Analyze patterns and trends
            const patternAnalysis = await this.analyzeErrorPatterns(categorizedErrors);
            
            // Generate fix recommendations
            const fixRecommendations = await this.generateFixRecommendations(
                categorizedErrors, 
                patternAnalysis, 
                taskContext
            );
            
            // Calculate quality metrics
            const qualityMetrics = await this.calculateQualityMetrics(validationResult, categorizedErrors);
            
            // Generate summary report
            const summaryReport = await this.generateSummaryReport(
                validationResult, 
                categorizedErrors, 
                qualityMetrics, 
                fixRecommendations
            );
            
            return {
                validation_id: validationId,
                overall_status: this.determineOverallStatus(categorizedErrors, qualityMetrics),
                overall_score: qualityMetrics.overall_score,
                grade: qualityMetrics.grade,
                
                // Error analysis
                categorized_errors: categorizedErrors,
                error_contexts: errorContexts,
                pattern_analysis: patternAnalysis,
                
                // Recommendations
                fix_recommendations: fixRecommendations,
                priority_fixes: this.prioritizeFixes(fixRecommendations),
                
                // Metrics
                quality_metrics: qualityMetrics,
                summary_report: summaryReport,
                
                // Raw data
                raw_validation_result: validationResult,
                processed_at: new Date()
            };
            
        } catch (error) {
            log('error', `Failed to process validation result: ${error.message}`);
            throw error;
        }
    }

    /**
     * Categorize errors from validation results
     * @param {Object} validationResult - Validation result
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @returns {Promise<Object>} Categorized errors
     */
    async categorizeErrors(validationResult, prData, taskContext) {
        const categorized = {
            [this.errorCategories.SYNTAX]: [],
            [this.errorCategories.LOGIC]: [],
            [this.errorCategories.SECURITY]: [],
            [this.errorCategories.PERFORMANCE]: [],
            [this.errorCategories.TESTING]: [],
            [this.errorCategories.DEPENDENCY]: [],
            [this.errorCategories.STYLE]: [],
            [this.errorCategories.DOCUMENTATION]: []
        };

        // Process each stage result
        for (const [stageName, stageResult] of Object.entries(validationResult.stages || {})) {
            if (stageResult.status === 'failed' || stageResult.result?.issues) {
                const stageErrors = await this.extractStageErrors(stageName, stageResult, prData, taskContext);
                
                for (const error of stageErrors) {
                    const category = this.categorizeError(error, stageName);
                    categorized[category].push(error);
                }
            }
        }

        // Add metadata
        for (const category of Object.keys(categorized)) {
            categorized[category] = {
                errors: categorized[category],
                count: categorized[category].length,
                severity_distribution: this.calculateSeverityDistribution(categorized[category]),
                most_common_type: this.findMostCommonErrorType(categorized[category])
            };
        }

        return categorized;
    }

    /**
     * Extract errors from a specific stage result
     * @param {string} stageName - Stage name
     * @param {Object} stageResult - Stage result
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @returns {Promise<Array>} Array of extracted errors
     */
    async extractStageErrors(stageName, stageResult, prData, taskContext) {
        const errors = [];
        
        // Handle stage execution failure
        if (stageResult.status === 'failed') {
            errors.push({
                id: `${stageName}_execution_failure_${Date.now()}`,
                type: 'execution_failure',
                stage: stageName,
                severity: this.severityLevels.HIGH,
                message: stageResult.error || 'Stage execution failed',
                details: {
                    error_stack: stageResult.error_stack,
                    duration_ms: stageResult.duration_ms
                },
                context: {
                    pr_number: prData.number || prData.id,
                    task_id: taskContext.task_id,
                    stage_config: stageResult.config
                }
            });
        }
        
        // Handle validation issues
        if (stageResult.result?.issues) {
            for (const issue of stageResult.result.issues) {
                errors.push({
                    id: `${stageName}_issue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    type: issue.type || 'validation_issue',
                    stage: stageName,
                    severity: this.normalizeSeverity(issue.severity),
                    message: issue.message || issue.description,
                    details: {
                        file_path: issue.file || issue.path,
                        line_number: issue.line,
                        column: issue.column,
                        rule: issue.rule,
                        category: issue.category,
                        suggestion: issue.suggestion
                    },
                    context: {
                        pr_number: prData.number || prData.id,
                        task_id: taskContext.task_id,
                        code_snippet: issue.code_snippet,
                        surrounding_context: issue.context
                    }
                });
            }
        }
        
        return errors;
    }

    /**
     * Categorize individual error
     * @param {Object} error - Error object
     * @param {string} stageName - Stage name
     * @returns {string} Error category
     */
    categorizeError(error, stageName) {
        // Stage-based categorization
        const stageCategories = {
            'syntax_check': this.errorCategories.SYNTAX,
            'linting': this.errorCategories.STYLE,
            'unit_tests': this.errorCategories.TESTING,
            'integration_tests': this.errorCategories.TESTING,
            'security_scan': this.errorCategories.SECURITY,
            'performance_test': this.errorCategories.PERFORMANCE,
            'dependency_check': this.errorCategories.DEPENDENCY,
            'code_quality': this.errorCategories.STYLE
        };
        
        if (stageCategories[stageName]) {
            return stageCategories[stageName];
        }
        
        // Content-based categorization
        const message = (error.message || '').toLowerCase();
        const type = (error.type || '').toLowerCase();
        
        if (message.includes('syntax') || message.includes('parse') || type.includes('syntax')) {
            return this.errorCategories.SYNTAX;
        }
        
        if (message.includes('security') || message.includes('vulnerability') || type.includes('security')) {
            return this.errorCategories.SECURITY;
        }
        
        if (message.includes('performance') || message.includes('slow') || type.includes('performance')) {
            return this.errorCategories.PERFORMANCE;
        }
        
        if (message.includes('test') || message.includes('assertion') || type.includes('test')) {
            return this.errorCategories.TESTING;
        }
        
        if (message.includes('dependency') || message.includes('import') || type.includes('dependency')) {
            return this.errorCategories.DEPENDENCY;
        }
        
        if (message.includes('style') || message.includes('format') || type.includes('style')) {
            return this.errorCategories.STYLE;
        }
        
        if (message.includes('documentation') || message.includes('comment') || type.includes('doc')) {
            return this.errorCategories.DOCUMENTATION;
        }
        
        // Default to logic category
        return this.errorCategories.LOGIC;
    }

    /**
     * Generate error contexts specifically for Codegen processing
     * @param {Object} categorizedErrors - Categorized errors
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @param {string} validationId - Validation ID
     * @returns {Promise<Array>} Array of Codegen error contexts
     */
    async generateCodegenErrorContexts(categorizedErrors, prData, taskContext, validationId) {
        const errorContexts = [];
        let contextCount = 0;
        
        // Process each category
        for (const [category, categoryData] of Object.entries(categorizedErrors)) {
            if (contextCount >= this.config.max_error_contexts) break;
            
            // Focus on high-priority errors
            const priorityErrors = categoryData.errors
                .filter(error => this.shouldIncludeInContext(error))
                .sort((a, b) => this.compareSeverity(b.severity, a.severity))
                .slice(0, 10); // Limit per category
            
            for (const error of priorityErrors) {
                if (contextCount >= this.config.max_error_contexts) break;
                
                const context = await this.createCodegenErrorContext(
                    error, 
                    category, 
                    prData, 
                    taskContext, 
                    validationId
                );
                
                if (context) {
                    errorContexts.push(context);
                    contextCount++;
                }
            }
        }
        
        return errorContexts;
    }

    /**
     * Create Codegen-specific error context
     * @param {Object} error - Error object
     * @param {string} category - Error category
     * @param {Object} prData - PR data
     * @param {Object} taskContext - Task context
     * @param {string} validationId - Validation ID
     * @returns {Promise<Object>} Codegen error context
     */
    async createCodegenErrorContext(error, category, prData, taskContext, validationId) {
        const contextId = `ctx_${validationId}_${error.id}`;
        
        return {
            context_id: contextId,
            validation_id: validationId,
            error_id: error.id,
            
            // Codegen-specific information
            codegen_context: {
                // Error classification
                error_category: category,
                error_type: error.type,
                severity: error.severity,
                stage: error.stage,
                
                // PR context
                pr_info: {
                    number: prData.number || prData.id,
                    title: prData.title,
                    description: prData.description,
                    branch: prData.branch || prData.head?.ref,
                    author: prData.author?.login || prData.author,
                    changed_files: prData.changed_files || [],
                    repository: prData.repository?.full_name || prData.repo_name
                },
                
                // Task context
                task_info: {
                    task_id: taskContext.task_id,
                    requirements: taskContext.requirements || [],
                    acceptance_criteria: taskContext.acceptance_criteria || [],
                    affected_files: taskContext.affected_files || []
                },
                
                // Error details
                error_details: {
                    message: error.message,
                    file_path: error.details?.file_path,
                    line_number: error.details?.line_number,
                    column: error.details?.column,
                    code_snippet: error.context?.code_snippet,
                    surrounding_context: error.context?.surrounding_context
                },
                
                // Fix guidance
                fix_guidance: {
                    suggested_actions: this.generateSuggestedActions(error, category),
                    fix_priority: this.determineFix Priority(error),
                    estimated_effort: this.estimateFixEffort(error, category),
                    related_errors: await this.findRelatedErrors(error, category),
                    fix_examples: this.generateFixExamples(error, category)
                },
                
                // Context for code generation
                generation_hints: {
                    focus_areas: this.identifyFocusAreas(error, category),
                    code_patterns: this.suggestCodePatterns(error, category),
                    best_practices: this.suggestBestPractices(error, category),
                    testing_requirements: this.identifyTestingRequirements(error, category)
                }
            },
            
            // Technical metadata
            technical_metadata: {
                created_at: new Date(),
                processor_version: '1.0.0',
                confidence_score: this.calculateConfidenceScore(error),
                processing_time_ms: Date.now() - Date.now() // Placeholder
            }
        };
    }

    /**
     * Analyze error patterns and trends
     * @param {Object} categorizedErrors - Categorized errors
     * @returns {Promise<Object>} Pattern analysis
     */
    async analyzeErrorPatterns(categorizedErrors) {
        const patterns = {
            most_common_category: null,
            severity_trends: {},
            file_hotspots: {},
            error_clusters: [],
            recurring_patterns: []
        };
        
        // Find most common category
        let maxCount = 0;
        for (const [category, data] of Object.entries(categorizedErrors)) {
            if (data.count > maxCount) {
                maxCount = data.count;
                patterns.most_common_category = category;
            }
        }
        
        // Analyze severity trends
        for (const [category, data] of Object.entries(categorizedErrors)) {
            patterns.severity_trends[category] = data.severity_distribution;
        }
        
        // Identify file hotspots
        const fileErrorCounts = {};
        for (const categoryData of Object.values(categorizedErrors)) {
            for (const error of categoryData.errors) {
                const filePath = error.details?.file_path;
                if (filePath) {
                    fileErrorCounts[filePath] = (fileErrorCounts[filePath] || 0) + 1;
                }
            }
        }
        
        patterns.file_hotspots = Object.entries(fileErrorCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [file, count]) => ({ ...obj, [file]: count }), {});
        
        return patterns;
    }

    /**
     * Generate fix recommendations
     * @param {Object} categorizedErrors - Categorized errors
     * @param {Object} patternAnalysis - Pattern analysis
     * @param {Object} taskContext - Task context
     * @returns {Promise<Array>} Fix recommendations
     */
    async generateFixRecommendations(categorizedErrors, patternAnalysis, taskContext) {
        const recommendations = [];
        
        // Category-based recommendations
        for (const [category, data] of Object.entries(categorizedErrors)) {
            if (data.count === 0) continue;
            
            const recommendation = {
                id: `rec_${category}_${Date.now()}`,
                category: category,
                priority: this.calculateCategoryPriority(category, data),
                title: this.generateRecommendationTitle(category, data),
                description: this.generateRecommendationDescription(category, data),
                affected_errors: data.count,
                estimated_effort: this.estimateCategoryEffort(category, data),
                suggested_approach: this.suggestCategoryApproach(category, data),
                success_criteria: this.defineCategorySuccessCriteria(category, data)
            };
            
            recommendations.push(recommendation);
        }
        
        // Pattern-based recommendations
        if (patternAnalysis.file_hotspots && Object.keys(patternAnalysis.file_hotspots).length > 0) {
            recommendations.push({
                id: `rec_hotspots_${Date.now()}`,
                category: 'file_hotspots',
                priority: 'high',
                title: 'Address File Hotspots',
                description: `Focus on files with multiple issues: ${Object.keys(patternAnalysis.file_hotspots).slice(0, 3).join(', ')}`,
                affected_errors: Object.values(patternAnalysis.file_hotspots).reduce((sum, count) => sum + count, 0),
                estimated_effort: 'medium',
                suggested_approach: 'Refactor high-error files systematically',
                success_criteria: 'Reduce error count in hotspot files by 80%'
            });
        }
        
        return recommendations.sort((a, b) => this.comparePriority(b.priority, a.priority));
    }

    /**
     * Utility methods
     */

    shouldIncludeInContext(error) {
        const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
        const threshold = severityOrder.indexOf(this.config.error_severity_threshold);
        const errorSeverity = severityOrder.indexOf(error.severity);
        
        return errorSeverity <= threshold;
    }

    normalizeSeverity(severity) {
        if (!severity) return this.severityLevels.MEDIUM;
        
        const normalized = severity.toLowerCase();
        if (normalized.includes('critical') || normalized.includes('error')) return this.severityLevels.CRITICAL;
        if (normalized.includes('high') || normalized.includes('major')) return this.severityLevels.HIGH;
        if (normalized.includes('medium') || normalized.includes('moderate')) return this.severityLevels.MEDIUM;
        if (normalized.includes('low') || normalized.includes('minor')) return this.severityLevels.LOW;
        if (normalized.includes('info') || normalized.includes('suggestion')) return this.severityLevels.INFO;
        
        return this.severityLevels.MEDIUM;
    }

    compareSeverity(a, b) {
        const order = ['critical', 'high', 'medium', 'low', 'info'];
        return order.indexOf(a) - order.indexOf(b);
    }

    calculateSeverityDistribution(errors) {
        const distribution = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0
        };
        
        for (const error of errors) {
            distribution[error.severity] = (distribution[error.severity] || 0) + 1;
        }
        
        return distribution;
    }

    findMostCommonErrorType(errors) {
        const typeCounts = {};
        for (const error of errors) {
            typeCounts[error.type] = (typeCounts[error.type] || 0) + 1;
        }
        
        return Object.entries(typeCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';
    }

    determineOverallStatus(categorizedErrors, qualityMetrics) {
        const criticalErrors = Object.values(categorizedErrors)
            .flatMap(cat => cat.errors)
            .filter(error => error.severity === 'critical');
        
        if (criticalErrors.length > 0) return 'failed';
        if (qualityMetrics.overall_score < 70) return 'warning';
        return 'success';
    }

    calculateQualityMetrics(validationResult, categorizedErrors) {
        const totalErrors = Object.values(categorizedErrors)
            .reduce((sum, cat) => sum + cat.count, 0);
        
        const criticalErrors = Object.values(categorizedErrors)
            .reduce((sum, cat) => sum + cat.severity_distribution.critical, 0);
        
        const highErrors = Object.values(categorizedErrors)
            .reduce((sum, cat) => sum + cat.severity_distribution.high, 0);
        
        // Calculate score based on error severity and count
        let score = 100;
        score -= criticalErrors * 20; // Critical errors heavily penalized
        score -= highErrors * 10;     // High errors moderately penalized
        score -= (totalErrors - criticalErrors - highErrors) * 2; // Other errors lightly penalized
        
        score = Math.max(0, Math.min(100, score));
        
        return {
            overall_score: Math.round(score),
            grade: this.calculateGrade(score),
            total_errors: totalErrors,
            critical_errors: criticalErrors,
            high_errors: highErrors,
            error_density: totalErrors / Math.max(1, validationResult.files_analyzed || 1)
        };
    }

    calculateGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    generateSuggestedActions(error, category) {
        const actions = {
            [this.errorCategories.SYNTAX]: [
                'Fix syntax errors in the code',
                'Check for missing brackets, semicolons, or quotes',
                'Verify proper language syntax'
            ],
            [this.errorCategories.SECURITY]: [
                'Address security vulnerability',
                'Update dependencies with security patches',
                'Review security best practices'
            ],
            [this.errorCategories.TESTING]: [
                'Fix failing tests',
                'Add missing test cases',
                'Review test assertions'
            ],
            [this.errorCategories.PERFORMANCE]: [
                'Optimize performance bottleneck',
                'Review algorithm efficiency',
                'Consider caching strategies'
            ]
        };
        
        return actions[category] || ['Review and fix the issue', 'Check documentation'];
    }

    determineFix Priority(error) {
        if (error.severity === 'critical') return 'critical';
        if (error.severity === 'high') return 'high';
        if (error.severity === 'medium') return 'medium';
        return 'low';
    }

    estimateFixEffort(error, category) {
        const effortMap = {
            [this.errorCategories.SYNTAX]: 'low',
            [this.errorCategories.STYLE]: 'low',
            [this.errorCategories.SECURITY]: 'high',
            [this.errorCategories.PERFORMANCE]: 'high',
            [this.errorCategories.TESTING]: 'medium',
            [this.errorCategories.LOGIC]: 'medium'
        };
        
        return effortMap[category] || 'medium';
    }

    async findRelatedErrors(error, category) {
        // This would implement logic to find related errors
        // For now, return empty array
        return [];
    }

    generateFixExamples(error, category) {
        // This would generate specific fix examples based on error type
        return [];
    }

    identifyFocusAreas(error, category) {
        const focusAreas = {
            [this.errorCategories.SYNTAX]: ['syntax', 'parsing', 'language_constructs'],
            [this.errorCategories.SECURITY]: ['security', 'vulnerabilities', 'input_validation'],
            [this.errorCategories.TESTING]: ['testing', 'assertions', 'test_coverage'],
            [this.errorCategories.PERFORMANCE]: ['performance', 'optimization', 'efficiency']
        };
        
        return focusAreas[category] || ['general'];
    }

    suggestCodePatterns(error, category) {
        // Return suggested code patterns based on error category
        return [];
    }

    suggestBestPractices(error, category) {
        // Return best practices based on error category
        return [];
    }

    identifyTestingRequirements(error, category) {
        // Return testing requirements based on error
        return [];
    }

    calculateConfidenceScore(error) {
        // Calculate confidence score based on error details
        let confidence = 0.5; // Base confidence
        
        if (error.details?.file_path) confidence += 0.2;
        if (error.details?.line_number) confidence += 0.2;
        if (error.context?.code_snippet) confidence += 0.1;
        
        return Math.min(1.0, confidence);
    }

    generateSummaryReport(validationResult, categorizedErrors, qualityMetrics, fixRecommendations) {
        const totalErrors = Object.values(categorizedErrors)
            .reduce((sum, cat) => sum + cat.count, 0);
        
        return {
            summary: `Validation completed with ${totalErrors} issues found across ${Object.keys(categorizedErrors).length} categories`,
            overall_grade: qualityMetrics.grade,
            top_priorities: fixRecommendations.slice(0, 3).map(rec => rec.title),
            key_metrics: {
                total_errors: totalErrors,
                critical_errors: qualityMetrics.critical_errors,
                overall_score: qualityMetrics.overall_score
            },
            next_steps: this.generateNextSteps(fixRecommendations)
        };
    }

    generateNextSteps(recommendations) {
        return recommendations.slice(0, 5).map((rec, index) => 
            `${index + 1}. ${rec.title} (${rec.priority} priority)`
        );
    }

    prioritizeFixes(recommendations) {
        return recommendations
            .filter(rec => rec.priority === 'critical' || rec.priority === 'high')
            .slice(0, 10);
    }

    calculateCategoryPriority(category, data) {
        if (data.severity_distribution.critical > 0) return 'critical';
        if (data.severity_distribution.high > 0) return 'high';
        if (data.count > 10) return 'medium';
        return 'low';
    }

    generateRecommendationTitle(category, data) {
        return `Address ${category} issues (${data.count} found)`;
    }

    generateRecommendationDescription(category, data) {
        return `Fix ${data.count} ${category} issues with ${data.severity_distribution.critical || 0} critical and ${data.severity_distribution.high || 0} high severity problems`;
    }

    estimateCategoryEffort(category, data) {
        if (data.count > 20) return 'high';
        if (data.count > 5) return 'medium';
        return 'low';
    }

    suggestCategoryApproach(category, data) {
        return `Systematically address ${category} issues starting with highest severity`;
    }

    defineCategorySuccessCriteria(category, data) {
        return `Reduce ${category} issues by 90% and eliminate all critical/high severity problems`;
    }

    comparePriority(a, b) {
        const order = ['critical', 'high', 'medium', 'low'];
        return order.indexOf(a) - order.indexOf(b);
    }
}

export default ResultProcessor;

