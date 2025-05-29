/**
 * validation_engine/scoring/score_calculator.js
 * 
 * Scoring engine for calculating validation scores based on analysis results.
 * Implements the weighted scoring system defined in VALIDATION_CRITERIA.
 */

import { log } from '../../scripts/modules/utils.js';
import { VALIDATION_CRITERIA } from '../../claude_code_validator/interfaces/types.js';

/**
 * Main score calculator class that computes validation scores
 */
export class ScoreCalculator {
    constructor(config = {}) {
        this.config = {
            criteria: VALIDATION_CRITERIA,
            grade_thresholds: {
                'A+': 95,
                'A': 90,
                'A-': 87,
                'B+': 83,
                'B': 80,
                'B-': 77,
                'C+': 73,
                'C': 70,
                'C-': 67,
                'D+': 63,
                'D': 60,
                'D-': 57,
                'F': 0
            },
            ...config
        };
    }

    /**
     * Calculates comprehensive validation scores from analysis results
     * 
     * @param {Object} validation_results - Combined validation results
     * @returns {Promise<Object>} Calculated scores and grades
     */
    async calculate_scores(validation_results) {
        const start_time = Date.now();
        log('info', 'Calculating validation scores');

        try {
            // Calculate individual category scores
            const code_quality_score = await this._calculateCodeQualityScore(validation_results);
            const functionality_score = await this._calculateFunctionalityScore(validation_results);
            const testing_score = await this._calculateTestingScore(validation_results);
            const documentation_score = await this._calculateDocumentationScore(validation_results);

            // Calculate weighted overall score
            const overall_score = this._calculateWeightedScore({
                code_quality: code_quality_score,
                functionality: functionality_score,
                testing: testing_score,
                documentation: documentation_score
            });

            // Generate detailed scores breakdown
            const detailed_scores = await this._generateDetailedScores(validation_results);

            // Determine letter grade
            const grade = this._calculateGrade(overall_score);

            // Identify strengths and weaknesses
            const { strengths, weaknesses } = this._analyzeStrengthsAndWeaknesses({
                code_quality: code_quality_score,
                functionality: functionality_score,
                testing: testing_score,
                documentation: documentation_score
            }, detailed_scores);

            const result = {
                overall_score: Math.round(overall_score),
                code_quality_score: Math.round(code_quality_score),
                functionality_score: Math.round(functionality_score),
                testing_score: Math.round(testing_score),
                documentation_score: Math.round(documentation_score),
                detailed_scores,
                grade,
                strengths,
                weaknesses,
                calculation_metadata: {
                    criteria_version: '1.0.0',
                    calculation_time_ms: Date.now() - start_time,
                    weights_used: this.config.criteria
                }
            };

            log('info', `Score calculation completed: ${overall_score} (${grade})`);
            return result;

        } catch (error) {
            log('error', `Score calculation failed: ${error.message}`, error.stack);
            throw new Error(`Score calculation failed: ${error.message}`);
        }
    }

    /**
     * Calculates code quality score based on style, complexity, and maintainability
     * 
     * @param {Object} validation_results - Validation results
     * @returns {Promise<number>} Code quality score (0-100)
     */
    async _calculateCodeQualityScore(validation_results) {
        const code_analysis = validation_results.code_analysis || {};
        
        // Style analysis score
        const style_score = code_analysis.style_analysis?.score || 0;
        
        // Complexity score (inverse relationship - lower complexity is better)
        const complexity_analysis = code_analysis.complexity_analysis || {};
        const complexity_score = this._calculateComplexityScore(complexity_analysis);
        
        // Maintainability score
        const maintainability_score = code_analysis.maintainability_analysis?.score || 0;
        
        // Security score
        const security_score = code_analysis.security_analysis?.security_score || 0;

        // Weighted average of quality metrics
        const quality_score = (
            style_score * 0.3 +
            complexity_score * 0.25 +
            maintainability_score * 0.25 +
            security_score * 0.2
        );

        return Math.max(0, Math.min(100, quality_score));
    }

    /**
     * Calculates functionality score based on requirements compliance
     * 
     * @param {Object} validation_results - Validation results
     * @returns {Promise<number>} Functionality score (0-100)
     */
    async _calculateFunctionalityScore(validation_results) {
        const compliance_results = validation_results.compliance_results || {};
        
        // Base compliance score
        const compliance_score = compliance_results.compliance_score || 0;
        
        // Adjust based on missing requirements
        const missing_requirements = compliance_results.missing_requirements || [];
        const missing_penalty = missing_requirements.length * 5;
        
        // Adjust based on exceeded requirements (bonus)
        const exceeded_requirements = compliance_results.exceeded_requirements || [];
        const exceeded_bonus = Math.min(exceeded_requirements.length * 2, 10);
        
        // Error handling assessment (from code analysis)
        const error_handling_score = this._assessErrorHandling(validation_results);
        
        const functionality_score = compliance_score - missing_penalty + exceeded_bonus + error_handling_score * 0.1;
        
        return Math.max(0, Math.min(100, functionality_score));
    }

    /**
     * Calculates testing score based on coverage and test quality
     * 
     * @param {Object} validation_results - Validation results
     * @returns {Promise<number>} Testing score (0-100)
     */
    async _calculateTestingScore(validation_results) {
        const test_results = validation_results.test_results || {};
        
        // Test coverage score
        const coverage_percentage = test_results.coverage_percentage || 0;
        const coverage_score = Math.min(coverage_percentage * 1.25, 100); // Bonus for high coverage
        
        // Test success rate
        const total_tests = test_results.total_tests || 1;
        const passed_tests = test_results.passed_tests || 0;
        const success_rate = (passed_tests / total_tests) * 100;
        
        // Test quality assessment
        const test_quality_score = this._assessTestQuality(test_results);
        
        // Regression test coverage (if available)
        const regression_score = this._assessRegressionCoverage(validation_results);
        
        const testing_score = (
            coverage_score * 0.4 +
            success_rate * 0.3 +
            test_quality_score * 0.2 +
            regression_score * 0.1
        );
        
        return Math.max(0, Math.min(100, testing_score));
    }

    /**
     * Calculates documentation score based on comments and documentation coverage
     * 
     * @param {Object} validation_results - Validation results
     * @returns {Promise<number>} Documentation score (0-100)
     */
    async _calculateDocumentationScore(validation_results) {
        const code_analysis = validation_results.code_analysis || {};
        const maintainability = code_analysis.maintainability_analysis || {};
        
        // Documentation coverage from maintainability analysis
        const doc_coverage = maintainability.documentation_coverage || 0;
        
        // Code comments assessment
        const comment_score = this._assessCodeComments(code_analysis);
        
        // API documentation assessment
        const api_doc_score = this._assessApiDocumentation(validation_results);
        
        // README and project documentation
        const project_doc_score = this._assessProjectDocumentation(validation_results);
        
        const documentation_score = (
            doc_coverage * 0.4 +
            comment_score * 0.3 +
            api_doc_score * 0.2 +
            project_doc_score * 0.1
        );
        
        return Math.max(0, Math.min(100, documentation_score));
    }

    /**
     * Calculates weighted overall score using criteria weights
     * 
     * @param {Object} category_scores - Individual category scores
     * @returns {number} Weighted overall score
     */
    _calculateWeightedScore(category_scores) {
        const criteria = this.config.criteria;
        
        return (
            category_scores.code_quality * criteria.code_quality.weight +
            category_scores.functionality * criteria.functionality.weight +
            category_scores.testing * criteria.testing.weight +
            category_scores.documentation * criteria.documentation.weight
        );
    }

    /**
     * Generates detailed breakdown of scores
     * 
     * @param {Object} validation_results - Validation results
     * @returns {Promise<Object>} Detailed scores
     */
    async _generateDetailedScores(validation_results) {
        const code_analysis = validation_results.code_analysis || {};
        
        return {
            style: code_analysis.style_analysis?.score || 0,
            complexity: this._calculateComplexityScore(code_analysis.complexity_analysis || {}),
            maintainability: code_analysis.maintainability_analysis?.score || 0,
            security: code_analysis.security_analysis?.security_score || 0,
            performance: code_analysis.performance_analysis?.performance_score || 0,
            requirements_coverage: validation_results.compliance_results?.compliance_score || 0,
            test_coverage: validation_results.test_results?.coverage_percentage || 0,
            test_quality: this._assessTestQuality(validation_results.test_results || {}),
            documentation_coverage: code_analysis.maintainability_analysis?.documentation_coverage || 0,
            error_handling: this._assessErrorHandling(validation_results),
            code_duplication: 100 - (code_analysis.maintainability_analysis?.code_duplication || 0) * 10,
            api_compliance: this._assessApiCompliance(validation_results)
        };
    }

    /**
     * Calculates complexity score (inverse of complexity metrics)
     * 
     * @param {Object} complexity_analysis - Complexity analysis results
     * @returns {number} Complexity score (0-100)
     */
    _calculateComplexityScore(complexity_analysis) {
        const avg_complexity = complexity_analysis.average_complexity || 1;
        const max_complexity = complexity_analysis.max_complexity || 1;
        
        // Lower complexity is better, so we invert the score
        const avg_score = Math.max(0, 100 - (avg_complexity - 1) * 15);
        const max_score = Math.max(0, 100 - (max_complexity - 5) * 10);
        
        return (avg_score + max_score) / 2;
    }

    /**
     * Assesses error handling quality
     * 
     * @param {Object} validation_results - Validation results
     * @returns {number} Error handling score (0-100)
     */
    _assessErrorHandling(validation_results) {
        // This would analyze try-catch blocks, error propagation, etc.
        // For now, return a mock score based on available data
        const security_analysis = validation_results.code_analysis?.security_analysis || {};
        const has_error_handling = security_analysis.potential_issues < 2;
        
        return has_error_handling ? 85 : 60;
    }

    /**
     * Assesses test quality beyond just coverage
     * 
     * @param {Object} test_results - Test results
     * @returns {number} Test quality score (0-100)
     */
    _assessTestQuality(test_results) {
        const total_tests = test_results.total_tests || 0;
        const test_failures = test_results.failed_tests || 0;
        const test_warnings = test_results.test_warnings?.length || 0;
        
        // Base score from test success rate
        const success_rate = total_tests > 0 ? ((total_tests - test_failures) / total_tests) * 100 : 0;
        
        // Penalty for warnings
        const warning_penalty = test_warnings * 2;
        
        // Bonus for having a good number of tests
        const test_count_bonus = Math.min(total_tests / 10, 10);
        
        return Math.max(0, Math.min(100, success_rate - warning_penalty + test_count_bonus));
    }

    /**
     * Assesses regression test coverage
     * 
     * @param {Object} validation_results - Validation results
     * @returns {number} Regression coverage score (0-100)
     */
    _assessRegressionCoverage(validation_results) {
        // This would check for regression tests, integration tests, etc.
        // For now, return a mock score
        const integration_tests = validation_results.integration_tests || {};
        return integration_tests.status === 'passed' ? 80 : 40;
    }

    /**
     * Assesses code comments quality
     * 
     * @param {Object} code_analysis - Code analysis results
     * @returns {number} Comment quality score (0-100)
     */
    _assessCodeComments(code_analysis) {
        // This would analyze comment density, quality, etc.
        // For now, return a score based on maintainability
        const maintainability = code_analysis.maintainability_analysis || {};
        return maintainability.documentation_coverage || 70;
    }

    /**
     * Assesses API documentation quality
     * 
     * @param {Object} validation_results - Validation results
     * @returns {number} API documentation score (0-100)
     */
    _assessApiDocumentation(validation_results) {
        // This would check for OpenAPI specs, JSDoc, etc.
        // For now, return a mock score
        return 75;
    }

    /**
     * Assesses project documentation quality
     * 
     * @param {Object} validation_results - Validation results
     * @returns {number} Project documentation score (0-100)
     */
    _assessProjectDocumentation(validation_results) {
        // This would check for README, CONTRIBUTING, etc.
        // For now, return a mock score
        return 80;
    }

    /**
     * Assesses API compliance
     * 
     * @param {Object} validation_results - Validation results
     * @returns {number} API compliance score (0-100)
     */
    _assessApiCompliance(validation_results) {
        // This would check REST API standards, GraphQL schema compliance, etc.
        // For now, return a mock score
        return 85;
    }

    /**
     * Determines letter grade based on overall score
     * 
     * @param {number} score - Overall score (0-100)
     * @returns {string} Letter grade
     */
    _calculateGrade(score) {
        const thresholds = this.config.grade_thresholds;
        
        for (const [grade, threshold] of Object.entries(thresholds)) {
            if (score >= threshold) {
                return grade;
            }
        }
        
        return 'F';
    }

    /**
     * Analyzes strengths and weaknesses based on scores
     * 
     * @param {Object} category_scores - Category scores
     * @param {Object} detailed_scores - Detailed scores
     * @returns {Object} Strengths and weaknesses analysis
     */
    _analyzeStrengthsAndWeaknesses(category_scores, detailed_scores) {
        const strengths = [];
        const weaknesses = [];
        
        // Analyze category scores
        Object.entries(category_scores).forEach(([category, score]) => {
            if (score >= 85) {
                strengths.push(this._getCategoryStrengthMessage(category, score));
            } else if (score < 70) {
                weaknesses.push(this._getCategoryWeaknessMessage(category, score));
            }
        });
        
        // Analyze detailed scores
        Object.entries(detailed_scores).forEach(([metric, score]) => {
            if (score >= 90) {
                strengths.push(this._getMetricStrengthMessage(metric, score));
            } else if (score < 60) {
                weaknesses.push(this._getMetricWeaknessMessage(metric, score));
            }
        });
        
        return {
            strengths: strengths.slice(0, 5), // Limit to top 5
            weaknesses: weaknesses.slice(0, 5) // Limit to top 5
        };
    }

    /**
     * Gets strength message for a category
     * 
     * @param {string} category - Category name
     * @param {number} score - Category score
     * @returns {string} Strength message
     */
    _getCategoryStrengthMessage(category, score) {
        const messages = {
            code_quality: `Excellent code quality (${Math.round(score)}%) with good style and maintainability`,
            functionality: `Strong functionality implementation (${Math.round(score)}%) meeting requirements well`,
            testing: `Comprehensive testing approach (${Math.round(score)}%) with good coverage`,
            documentation: `Well-documented code (${Math.round(score)}%) with clear explanations`
        };
        
        return messages[category] || `Strong ${category} (${Math.round(score)}%)`;
    }

    /**
     * Gets weakness message for a category
     * 
     * @param {string} category - Category name
     * @param {number} score - Category score
     * @returns {string} Weakness message
     */
    _getCategoryWeaknessMessage(category, score) {
        const messages = {
            code_quality: `Code quality needs improvement (${Math.round(score)}%) - focus on style and complexity`,
            functionality: `Functionality implementation incomplete (${Math.round(score)}%) - missing requirements`,
            testing: `Testing coverage insufficient (${Math.round(score)}%) - add more tests`,
            documentation: `Documentation lacking (${Math.round(score)}%) - improve comments and docs`
        };
        
        return messages[category] || `${category} needs improvement (${Math.round(score)}%)`;
    }

    /**
     * Gets strength message for a detailed metric
     * 
     * @param {string} metric - Metric name
     * @param {number} score - Metric score
     * @returns {string} Strength message
     */
    _getMetricStrengthMessage(metric, score) {
        const messages = {
            style: 'Consistent code style and formatting',
            security: 'Strong security practices implemented',
            performance: 'Well-optimized performance characteristics',
            test_coverage: 'Excellent test coverage',
            maintainability: 'Highly maintainable code structure'
        };
        
        return messages[metric] || `Excellent ${metric.replace('_', ' ')}`;
    }

    /**
     * Gets weakness message for a detailed metric
     * 
     * @param {string} metric - Metric name
     * @param {number} score - Metric score
     * @returns {string} Weakness message
     */
    _getMetricWeaknessMessage(metric, score) {
        const messages = {
            style: 'Code style inconsistencies need attention',
            complexity: 'High code complexity should be reduced',
            security: 'Security vulnerabilities need to be addressed',
            performance: 'Performance optimizations needed',
            test_coverage: 'Test coverage is too low',
            error_handling: 'Error handling needs improvement'
        };
        
        return messages[metric] || `${metric.replace('_', ' ')} needs improvement`;
    }
}

export { ScoreCalculator };

