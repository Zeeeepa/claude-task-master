/**
 * feedback_generator/processors/feedback_processor.js
 * 
 * Intelligent feedback processor that generates actionable improvement suggestions
 * based on validation results. Uses templates and AI-powered analysis to create
 * contextual, helpful feedback for developers.
 */

import { log } from '../../scripts/modules/utils.js';
import {
    FEEDBACK_TYPES,
    FEEDBACK_CATEGORIES,
    SEVERITY_LEVELS
} from '../../claude_code_validator/interfaces/types.js';

/**
 * Main feedback processor that generates intelligent feedback
 */
export class FeedbackProcessor {
    constructor(config = {}) {
        this.config = {
            max_feedback_items: 20,
            prioritize_critical: true,
            include_code_examples: true,
            include_resources: true,
            ...config
        };
        
        this.feedback_generators = {
            code_quality: new CodeQualityFeedbackGenerator(),
            functionality: new FunctionalityFeedbackGenerator(),
            testing: new TestingFeedbackGenerator(),
            documentation: new DocumentationFeedbackGenerator(),
            security: new SecurityFeedbackGenerator(),
            performance: new PerformanceFeedbackGenerator()
        };
    }

    /**
     * Generates comprehensive feedback from validation results
     * 
     * @param {Object} validation_results - Complete validation results
     * @param {Object} task_context - Task context for targeted feedback
     * @returns {Promise<Array>} Array of feedback items
     */
    async generate_feedback(validation_results, task_context = {}) {
        const start_time = Date.now();
        log('info', 'Generating validation feedback');

        try {
            const all_feedback = [];

            // Generate feedback from each category
            for (const [category, generator] of Object.entries(this.feedback_generators)) {
                try {
                    const category_feedback = await generator.generate(validation_results, task_context);
                    all_feedback.push(...category_feedback);
                } catch (error) {
                    log('warning', `Failed to generate ${category} feedback: ${error.message}`);
                }
            }

            // Sort feedback by priority and severity
            const prioritized_feedback = this._prioritizeFeedback(all_feedback);

            // Limit feedback items if configured
            const final_feedback = this.config.max_feedback_items > 0 
                ? prioritized_feedback.slice(0, this.config.max_feedback_items)
                : prioritized_feedback;

            // Enhance feedback with additional context
            const enhanced_feedback = await this._enhanceFeedback(final_feedback, validation_results, task_context);

            log('info', `Generated ${enhanced_feedback.length} feedback items in ${Date.now() - start_time}ms`);
            return enhanced_feedback;

        } catch (error) {
            log('error', `Feedback generation failed: ${error.message}`, error.stack);
            throw new Error(`Feedback generation failed: ${error.message}`);
        }
    }

    /**
     * Generates improvement suggestions based on validation results
     * 
     * @param {Object} validation_results - Validation results
     * @param {Object} task_context - Task context
     * @returns {Promise<Array>} Array of improvement suggestions
     */
    async generate_suggestions(validation_results, task_context = {}) {
        log('info', 'Generating improvement suggestions');

        try {
            const suggestions = [];

            // Analyze validation results for improvement opportunities
            const opportunities = this._identifyImprovementOpportunities(validation_results);

            for (const opportunity of opportunities) {
                const suggestion = await this._createImprovementSuggestion(opportunity, validation_results, task_context);
                if (suggestion) {
                    suggestions.push(suggestion);
                }
            }

            // Sort suggestions by impact and effort
            return this._prioritizeSuggestions(suggestions);

        } catch (error) {
            log('error', `Suggestion generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Prioritizes feedback items by severity and importance
     * 
     * @param {Array} feedback_items - Array of feedback items
     * @returns {Array} Prioritized feedback items
     */
    _prioritizeFeedback(feedback_items) {
        const severity_weights = {
            [SEVERITY_LEVELS.CRITICAL]: 4,
            [SEVERITY_LEVELS.HIGH]: 3,
            [SEVERITY_LEVELS.MEDIUM]: 2,
            [SEVERITY_LEVELS.LOW]: 1
        };

        const type_weights = {
            [FEEDBACK_TYPES.ERROR]: 4,
            [FEEDBACK_TYPES.WARNING]: 3,
            [FEEDBACK_TYPES.SUGGESTION]: 2,
            [FEEDBACK_TYPES.INFO]: 1
        };

        return feedback_items.sort((a, b) => {
            const a_weight = (severity_weights[a.severity] || 1) + (type_weights[a.type] || 1);
            const b_weight = (severity_weights[b.severity] || 1) + (type_weights[b.type] || 1);
            return b_weight - a_weight;
        });
    }

    /**
     * Enhances feedback with additional context and examples
     * 
     * @param {Array} feedback_items - Feedback items to enhance
     * @param {Object} validation_results - Validation results
     * @param {Object} task_context - Task context
     * @returns {Promise<Array>} Enhanced feedback items
     */
    async _enhanceFeedback(feedback_items, validation_results, task_context) {
        const enhanced = [];

        for (const item of feedback_items) {
            const enhanced_item = { ...item };

            // Add code examples if configured
            if (this.config.include_code_examples && !item.code_examples) {
                enhanced_item.code_examples = await this._generateCodeExamples(item, validation_results);
            }

            // Add helpful resources if configured
            if (this.config.include_resources && !item.resources) {
                enhanced_item.resources = await this._generateResources(item);
            }

            // Add task-specific context
            if (task_context.task_id) {
                enhanced_item.context = {
                    ...enhanced_item.context,
                    task_id: task_context.task_id,
                    task_priority: task_context.priority
                };
            }

            enhanced.push(enhanced_item);
        }

        return enhanced;
    }

    /**
     * Identifies improvement opportunities from validation results
     * 
     * @param {Object} validation_results - Validation results
     * @returns {Array} Array of improvement opportunities
     */
    _identifyImprovementOpportunities(validation_results) {
        const opportunities = [];

        // Check test coverage
        const test_results = validation_results.test_results || {};
        if (test_results.coverage_percentage < 80) {
            opportunities.push({
                type: 'test_coverage',
                current_value: test_results.coverage_percentage,
                target_value: 80,
                impact: 'high',
                effort: 'medium'
            });
        }

        // Check code complexity
        const complexity_analysis = validation_results.code_analysis?.complexity_analysis || {};
        if (complexity_analysis.average_complexity > 5) {
            opportunities.push({
                type: 'code_complexity',
                current_value: complexity_analysis.average_complexity,
                target_value: 4,
                impact: 'medium',
                effort: 'high'
            });
        }

        // Check documentation coverage
        const maintainability = validation_results.code_analysis?.maintainability_analysis || {};
        if (maintainability.documentation_coverage < 70) {
            opportunities.push({
                type: 'documentation',
                current_value: maintainability.documentation_coverage,
                target_value: 80,
                impact: 'medium',
                effort: 'low'
            });
        }

        // Check security issues
        const security_analysis = validation_results.code_analysis?.security_analysis || {};
        if (security_analysis.potential_issues > 0) {
            opportunities.push({
                type: 'security',
                current_value: security_analysis.potential_issues,
                target_value: 0,
                impact: 'high',
                effort: 'medium'
            });
        }

        return opportunities;
    }

    /**
     * Creates an improvement suggestion from an opportunity
     * 
     * @param {Object} opportunity - Improvement opportunity
     * @param {Object} validation_results - Validation results
     * @param {Object} task_context - Task context
     * @returns {Promise<Object>} Improvement suggestion
     */
    async _createImprovementSuggestion(opportunity, validation_results, task_context) {
        const suggestion_templates = {
            test_coverage: {
                title: 'Improve Test Coverage',
                description: `Increase test coverage from ${opportunity.current_value}% to ${opportunity.target_value}%`,
                category: FEEDBACK_CATEGORIES.TESTING,
                code_examples: [
                    'Add unit tests for edge cases',
                    'Include integration tests for API endpoints',
                    'Add error handling tests'
                ],
                resources: [
                    'Jest testing framework documentation',
                    'Test-driven development best practices',
                    'Code coverage tools and techniques'
                ]
            },
            code_complexity: {
                title: 'Reduce Code Complexity',
                description: `Simplify complex functions to reduce average complexity from ${opportunity.current_value} to ${opportunity.target_value}`,
                category: FEEDBACK_CATEGORIES.CODE_QUALITY,
                code_examples: [
                    'Extract complex logic into smaller functions',
                    'Use early returns to reduce nesting',
                    'Apply the single responsibility principle'
                ],
                resources: [
                    'Clean Code principles',
                    'Refactoring techniques',
                    'Cyclomatic complexity guidelines'
                ]
            },
            documentation: {
                title: 'Enhance Documentation',
                description: `Improve documentation coverage from ${opportunity.current_value}% to ${opportunity.target_value}%`,
                category: FEEDBACK_CATEGORIES.DOCUMENTATION,
                code_examples: [
                    'Add JSDoc comments to functions',
                    'Document API endpoints',
                    'Update README with usage examples'
                ],
                resources: [
                    'JSDoc documentation guide',
                    'API documentation best practices',
                    'Technical writing guidelines'
                ]
            },
            security: {
                title: 'Address Security Issues',
                description: `Fix ${opportunity.current_value} potential security issue(s)`,
                category: FEEDBACK_CATEGORIES.SECURITY,
                code_examples: [
                    'Implement input validation',
                    'Use parameterized queries',
                    'Add authentication checks'
                ],
                resources: [
                    'OWASP security guidelines',
                    'Secure coding practices',
                    'Security testing tools'
                ]
            }
        };

        const template = suggestion_templates[opportunity.type];
        if (!template) return null;

        return {
            id: `suggestion_${opportunity.type}_${Date.now()}`,
            title: template.title,
            description: template.description,
            category: template.category,
            priority: opportunity.impact,
            effort_estimate: this._estimateEffort(opportunity),
            code_examples: template.code_examples,
            resources: template.resources,
            impact_analysis: {
                current_state: opportunity.current_value,
                target_state: opportunity.target_value,
                expected_impact: opportunity.impact
            }
        };
    }

    /**
     * Estimates effort required for an improvement
     * 
     * @param {Object} opportunity - Improvement opportunity
     * @returns {string} Effort estimate
     */
    _estimateEffort(opportunity) {
        const effort_map = {
            low: '1-2 hours',
            medium: '2-4 hours',
            high: '4-8 hours',
            very_high: '1-2 days'
        };

        return effort_map[opportunity.effort] || 'Unknown';
    }

    /**
     * Prioritizes suggestions by impact and effort
     * 
     * @param {Array} suggestions - Array of suggestions
     * @returns {Array} Prioritized suggestions
     */
    _prioritizeSuggestions(suggestions) {
        const impact_weights = { high: 3, medium: 2, low: 1 };
        const effort_weights = { low: 3, medium: 2, high: 1, very_high: 0.5 };

        return suggestions.sort((a, b) => {
            const a_score = (impact_weights[a.priority] || 1) * (effort_weights[a.effort] || 1);
            const b_score = (impact_weights[b.priority] || 1) * (effort_weights[b.effort] || 1);
            return b_score - a_score;
        });
    }

    /**
     * Generates code examples for feedback items
     * 
     * @param {Object} feedback_item - Feedback item
     * @param {Object} validation_results - Validation results
     * @returns {Promise<Array>} Array of code examples
     */
    async _generateCodeExamples(feedback_item, validation_results) {
        // This would typically use AI or templates to generate relevant code examples
        // For now, return generic examples based on category
        const examples = {
            [FEEDBACK_CATEGORIES.CODE_QUALITY]: [
                '// Use consistent indentation\nfunction example() {\n  return true;\n}',
                '// Follow naming conventions\nconst userName = "john_doe";'
            ],
            [FEEDBACK_CATEGORIES.TESTING]: [
                'test("should handle edge case", () => {\n  expect(fn(null)).toBe(null);\n});',
                'describe("API endpoints", () => {\n  test("GET /users", async () => {\n    // test implementation\n  });\n});'
            ],
            [FEEDBACK_CATEGORIES.SECURITY]: [
                '// Validate input\nif (!isValidInput(userInput)) {\n  throw new Error("Invalid input");\n}',
                '// Use parameterized queries\nconst query = "SELECT * FROM users WHERE id = ?";'
            ]
        };

        return examples[feedback_item.category] || ['// No specific examples available'];
    }

    /**
     * Generates helpful resources for feedback items
     * 
     * @param {Object} feedback_item - Feedback item
     * @returns {Promise<Array>} Array of resource links
     */
    async _generateResources(feedback_item) {
        const resources = {
            [FEEDBACK_CATEGORIES.CODE_QUALITY]: [
                'https://eslint.org/docs/rules/',
                'https://prettier.io/docs/en/configuration.html',
                'Clean Code by Robert C. Martin'
            ],
            [FEEDBACK_CATEGORIES.TESTING]: [
                'https://jestjs.io/docs/getting-started',
                'https://testing-library.com/docs/',
                'Test-Driven Development best practices'
            ],
            [FEEDBACK_CATEGORIES.SECURITY]: [
                'https://owasp.org/www-project-top-ten/',
                'https://cheatsheetseries.owasp.org/',
                'Secure coding guidelines'
            ],
            [FEEDBACK_CATEGORIES.DOCUMENTATION]: [
                'https://jsdoc.app/',
                'https://swagger.io/docs/',
                'Technical writing best practices'
            ]
        };

        return resources[feedback_item.category] || ['General programming best practices'];
    }
}

/**
 * Base class for category-specific feedback generators
 */
class BaseFeedbackGenerator {
    async generate(validation_results, task_context) {
        throw new Error('generate method must be implemented by subclass');
    }

    _createFeedbackItem(config) {
        return {
            id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: config.type || FEEDBACK_TYPES.INFO,
            category: config.category,
            title: config.title,
            message: config.message,
            file_path: config.file_path,
            line_number: config.line_number,
            severity: config.severity || SEVERITY_LEVELS.MEDIUM,
            suggestions: config.suggestions || [],
            context: config.context || {}
        };
    }
}

/**
 * Code quality feedback generator
 */
class CodeQualityFeedbackGenerator extends BaseFeedbackGenerator {
    async generate(validation_results, task_context) {
        const feedback = [];
        const code_analysis = validation_results.code_analysis || {};

        // Style analysis feedback
        const style_analysis = code_analysis.style_analysis || {};
        if (style_analysis.score < 80) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.WARNING,
                category: FEEDBACK_CATEGORIES.CODE_QUALITY,
                title: 'Code Style Issues',
                message: `Code style score is ${style_analysis.score}%. Found ${style_analysis.issues} style issues.`,
                severity: style_analysis.score < 60 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Run a code formatter (Prettier)',
                    'Configure ESLint for consistent style',
                    'Follow established style guidelines'
                ],
                context: { style_score: style_analysis.score, issues_count: style_analysis.issues }
            }));
        }

        // Complexity feedback
        const complexity_analysis = code_analysis.complexity_analysis || {};
        if (complexity_analysis.average_complexity > 5) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.WARNING,
                category: FEEDBACK_CATEGORIES.CODE_QUALITY,
                title: 'High Code Complexity',
                message: `Average complexity is ${complexity_analysis.average_complexity}, which is above the recommended threshold of 5.`,
                severity: SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Break down complex functions into smaller ones',
                    'Reduce nesting levels',
                    'Apply single responsibility principle'
                ],
                context: { average_complexity: complexity_analysis.average_complexity }
            }));
        }

        return feedback;
    }
}

/**
 * Functionality feedback generator
 */
class FunctionalityFeedbackGenerator extends BaseFeedbackGenerator {
    async generate(validation_results, task_context) {
        const feedback = [];
        const compliance_results = validation_results.compliance_results || {};

        // Missing requirements feedback
        const missing_requirements = compliance_results.missing_requirements || [];
        if (missing_requirements.length > 0) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.ERROR,
                category: FEEDBACK_CATEGORIES.FUNCTIONALITY,
                title: 'Missing Requirements',
                message: `${missing_requirements.length} requirement(s) are not implemented: ${missing_requirements.join(', ')}`,
                severity: SEVERITY_LEVELS.HIGH,
                suggestions: [
                    'Review task requirements carefully',
                    'Implement missing functionality',
                    'Update acceptance criteria'
                ],
                context: { missing_requirements }
            }));
        }

        // Compliance score feedback
        if (compliance_results.compliance_score < 80) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.WARNING,
                category: FEEDBACK_CATEGORIES.FUNCTIONALITY,
                title: 'Low Requirements Compliance',
                message: `Requirements compliance is ${compliance_results.compliance_score}%, below the expected 80%.`,
                severity: SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Review and address missing requirements',
                    'Improve implementation quality',
                    'Add comprehensive error handling'
                ],
                context: { compliance_score: compliance_results.compliance_score }
            }));
        }

        return feedback;
    }
}

/**
 * Testing feedback generator
 */
class TestingFeedbackGenerator extends BaseFeedbackGenerator {
    async generate(validation_results, task_context) {
        const feedback = [];
        const test_results = validation_results.test_results || {};

        // Test coverage feedback
        if (test_results.coverage_percentage < 80) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.WARNING,
                category: FEEDBACK_CATEGORIES.TESTING,
                title: 'Low Test Coverage',
                message: `Test coverage is ${test_results.coverage_percentage}%, below the recommended 80%.`,
                severity: test_results.coverage_percentage < 60 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Add unit tests for uncovered code paths',
                    'Include integration tests',
                    'Test edge cases and error scenarios'
                ],
                context: { coverage_percentage: test_results.coverage_percentage }
            }));
        }

        // Failed tests feedback
        if (test_results.failed_tests > 0) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.ERROR,
                category: FEEDBACK_CATEGORIES.TESTING,
                title: 'Test Failures',
                message: `${test_results.failed_tests} out of ${test_results.total_tests} tests are failing.`,
                severity: SEVERITY_LEVELS.HIGH,
                suggestions: [
                    'Fix failing tests',
                    'Review test assertions',
                    'Check for breaking changes'
                ],
                context: { 
                    failed_tests: test_results.failed_tests,
                    total_tests: test_results.total_tests
                }
            }));
        }

        return feedback;
    }
}

/**
 * Documentation feedback generator
 */
class DocumentationFeedbackGenerator extends BaseFeedbackGenerator {
    async generate(validation_results, task_context) {
        const feedback = [];
        const maintainability = validation_results.code_analysis?.maintainability_analysis || {};

        // Documentation coverage feedback
        if (maintainability.documentation_coverage < 70) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.SUGGESTION,
                category: FEEDBACK_CATEGORIES.DOCUMENTATION,
                title: 'Improve Documentation',
                message: `Documentation coverage is ${maintainability.documentation_coverage}%, below the recommended 70%.`,
                severity: SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Add JSDoc comments to functions',
                    'Document complex algorithms',
                    'Update README with usage examples'
                ],
                context: { documentation_coverage: maintainability.documentation_coverage }
            }));
        }

        return feedback;
    }
}

/**
 * Security feedback generator
 */
class SecurityFeedbackGenerator extends BaseFeedbackGenerator {
    async generate(validation_results, task_context) {
        const feedback = [];
        const security_analysis = validation_results.code_analysis?.security_analysis || {};

        // Security issues feedback
        if (security_analysis.potential_issues > 0) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.ERROR,
                category: FEEDBACK_CATEGORIES.SECURITY,
                title: 'Security Issues Detected',
                message: `Found ${security_analysis.potential_issues} potential security issue(s).`,
                severity: SEVERITY_LEVELS.HIGH,
                suggestions: [
                    'Implement input validation',
                    'Use parameterized queries',
                    'Add authentication and authorization checks'
                ],
                context: { potential_issues: security_analysis.potential_issues }
            }));
        }

        return feedback;
    }
}

/**
 * Performance feedback generator
 */
class PerformanceFeedbackGenerator extends BaseFeedbackGenerator {
    async generate(validation_results, task_context) {
        const feedback = [];
        const performance_analysis = validation_results.code_analysis?.performance_analysis || {};

        // Performance issues feedback
        if (performance_analysis.potential_issues > 0) {
            feedback.push(this._createFeedbackItem({
                type: FEEDBACK_TYPES.SUGGESTION,
                category: FEEDBACK_CATEGORIES.PERFORMANCE,
                title: 'Performance Optimization Opportunities',
                message: `Found ${performance_analysis.potential_issues} potential performance issue(s).`,
                severity: SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Optimize database queries',
                    'Implement caching strategies',
                    'Consider lazy loading for large datasets'
                ],
                context: { potential_issues: performance_analysis.potential_issues }
            }));
        }

        return feedback;
    }
}

export {
    FeedbackProcessor,
    BaseFeedbackGenerator,
    CodeQualityFeedbackGenerator,
    FunctionalityFeedbackGenerator,
    TestingFeedbackGenerator,
    DocumentationFeedbackGenerator,
    SecurityFeedbackGenerator,
    PerformanceFeedbackGenerator
};

