/**
 * claude_code_validator/mocks/mock_validator.js
 * 
 * Mock implementations for the Claude Code validation system.
 * These mocks enable immediate testing and development while real implementations
 * are being built, supporting the maximum concurrency development approach.
 */

import {
    ClaudeCodeValidator,
    ClaudeCodeClient,
    DeploymentManager,
    ValidationEngine,
    FeedbackGenerator,
    MetricsTracker
} from '../interfaces/validator.js';
import {
    VALIDATION_CRITERIA,
    VALIDATION_STATUS,
    FEEDBACK_TYPES,
    FEEDBACK_CATEGORIES,
    SEVERITY_LEVELS
} from '../interfaces/types.js';

/**
 * Mock Claude Code Validator
 * Provides realistic validation results for testing and development
 */
export class MockClaudeCodeValidator extends ClaudeCodeValidator {
    constructor(config = {}) {
        super();
        this.config = {
            success_rate: 0.8,
            average_score: 75,
            response_delay: 1000,
            ...config
        };
    }

    async validate_pr(pr_info, task_context) {
        await this._simulateDelay();
        
        const should_succeed = Math.random() < this.config.success_rate;
        const base_score = this.config.average_score + (Math.random() - 0.5) * 20;
        
        if (!should_succeed) {
            return this._generateFailedValidation(pr_info, task_context);
        }

        return this._generateSuccessfulValidation(pr_info, task_context, base_score);
    }

    async deploy_pr_branch(pr_info) {
        await this._simulateDelay(500);
        
        return {
            deployment_id: `mock_deploy_${Date.now()}`,
            status: 'success',
            deployment_path: `/tmp/mock_deployments/${pr_info.branch_name}`,
            environment_type: 'local',
            deployed_files: this._generateMockFileList(),
            failed_files: [],
            environment_info: {
                node_version: 'v18.17.0',
                npm_version: '9.6.7',
                platform: 'linux',
                memory: { total: '8GB', available: '4GB' }
            },
            deployment_timestamp: new Date(),
            logs: [
                'Cloning repository...',
                'Checking out branch...',
                'Installing dependencies...',
                'Setting up environment...',
                'Deployment completed successfully'
            ],
            metadata: { mock: true, pr_info }
        };
    }

    async run_validation_suite(deployment) {
        await this._simulateDelay(2000);
        
        return {
            suite_id: `mock_suite_${Date.now()}`,
            code_analysis: this._generateMockCodeAnalysis(),
            test_results: this._generateMockTestResults(),
            compliance_results: this._generateMockComplianceResults(),
            integration_tests: { status: 'passed', duration_ms: 1500 },
            performance_tests: { status: 'passed', duration_ms: 800 },
            security_tests: { status: 'passed', duration_ms: 1200 },
            suite_timestamp: new Date(),
            total_duration_ms: 8000,
            suite_version: '1.0.0-mock'
        };
    }

    async generate_feedback(validation) {
        await this._simulateDelay(300);
        
        return this._generateMockFeedback(validation);
    }

    async track_validation_metrics(validation) {
        await this._simulateDelay(100);
        // Mock storage - in real implementation would persist to database
        console.log(`[MOCK] Stored validation metrics for task ${validation.task_id}`);
    }

    _generateSuccessfulValidation(pr_info, task_context, base_score) {
        const score = Math.max(60, Math.min(100, base_score));
        const status = score >= 90 ? VALIDATION_STATUS.PASSED : 
                      score >= 70 ? VALIDATION_STATUS.NEEDS_IMPROVEMENT : 
                      VALIDATION_STATUS.FAILED;

        return {
            task_id: task_context.task_id,
            pr_number: pr_info.number,
            status,
            score: this._generateMockScore(score),
            feedback: this._generateMockFeedback(),
            suggestions: this._generateMockSuggestions(),
            metrics: this._generateMockMetrics(),
            validation_timestamp: new Date(),
            validator_version: '1.0.0-mock',
            raw_results: { mock: true, base_score }
        };
    }

    _generateFailedValidation(pr_info, task_context) {
        return {
            task_id: task_context.task_id,
            pr_number: pr_info.number,
            status: VALIDATION_STATUS.ERROR,
            score: { overall_score: 0, grade: 'F' },
            feedback: [{
                id: `mock_error_${Date.now()}`,
                type: FEEDBACK_TYPES.ERROR,
                category: FEEDBACK_CATEGORIES.FUNCTIONALITY,
                title: 'Mock Validation Failure',
                message: 'This is a simulated validation failure for testing purposes',
                severity: SEVERITY_LEVELS.HIGH,
                suggestions: ['Check mock configuration', 'Retry validation'],
                context: { mock: true }
            }],
            suggestions: [],
            metrics: { validation_duration_ms: 1000, error: 'Mock failure' },
            validation_timestamp: new Date(),
            validator_version: '1.0.0-mock',
            raw_results: { mock: true, error: 'Simulated failure' }
        };
    }

    _generateMockScore(base_score) {
        return {
            overall_score: Math.round(base_score),
            code_quality_score: Math.round(base_score + (Math.random() - 0.5) * 10),
            functionality_score: Math.round(base_score + (Math.random() - 0.5) * 15),
            testing_score: Math.round(base_score + (Math.random() - 0.5) * 20),
            documentation_score: Math.round(base_score + (Math.random() - 0.5) * 25),
            detailed_scores: {
                style: Math.round(base_score + (Math.random() - 0.5) * 10),
                complexity: Math.round(base_score + (Math.random() - 0.5) * 15),
                maintainability: Math.round(base_score + (Math.random() - 0.5) * 12),
                requirements_coverage: Math.round(base_score + (Math.random() - 0.5) * 8)
            },
            grade: base_score >= 90 ? 'A' : base_score >= 80 ? 'B' : base_score >= 70 ? 'C' : 'D',
            strengths: this._getRandomStrengths(),
            weaknesses: this._getRandomWeaknesses()
        };
    }

    _generateMockFeedback() {
        const feedback_items = [
            {
                id: `mock_feedback_1_${Date.now()}`,
                type: FEEDBACK_TYPES.WARNING,
                category: FEEDBACK_CATEGORIES.CODE_QUALITY,
                title: 'Code Style Inconsistencies',
                message: 'Found 3 style inconsistencies that should be addressed for better readability',
                file_path: 'src/components/UserProfile.js',
                line_number: 42,
                severity: SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Use consistent indentation (2 spaces)',
                    'Add semicolons at end of statements',
                    'Use camelCase for variable names'
                ],
                context: { mock: true, tool: 'eslint' }
            },
            {
                id: `mock_feedback_2_${Date.now()}`,
                type: FEEDBACK_TYPES.SUGGESTION,
                category: FEEDBACK_CATEGORIES.TESTING,
                title: 'Improve Test Coverage',
                message: 'Test coverage is 72%. Consider adding tests for edge cases',
                severity: SEVERITY_LEVELS.MEDIUM,
                suggestions: [
                    'Add tests for error handling scenarios',
                    'Include boundary value tests',
                    'Test async operations thoroughly'
                ],
                context: { mock: true, current_coverage: 72, target_coverage: 80 }
            },
            {
                id: `mock_feedback_3_${Date.now()}`,
                type: FEEDBACK_TYPES.INFO,
                category: FEEDBACK_CATEGORIES.PERFORMANCE,
                title: 'Performance Optimization Opportunity',
                message: 'Consider memoizing expensive calculations in the render method',
                file_path: 'src/components/DataVisualization.js',
                line_number: 156,
                severity: SEVERITY_LEVELS.LOW,
                suggestions: [
                    'Use React.memo for component memoization',
                    'Implement useMemo for expensive calculations',
                    'Consider virtualization for large lists'
                ],
                context: { mock: true, performance_impact: 'medium' }
            }
        ];

        // Return a random subset of feedback items
        const count = Math.floor(Math.random() * 3) + 1;
        return feedback_items.slice(0, count);
    }

    _generateMockSuggestions() {
        return [
            {
                id: `mock_suggestion_1_${Date.now()}`,
                title: 'Implement Error Boundaries',
                description: 'Add React error boundaries to improve error handling and user experience',
                category: FEEDBACK_CATEGORIES.FUNCTIONALITY,
                priority: 'high',
                effort_estimate: '2-3 hours',
                code_examples: [
                    'class ErrorBoundary extends React.Component { ... }',
                    '<ErrorBoundary><App /></ErrorBoundary>'
                ],
                resources: [
                    'https://reactjs.org/docs/error-boundaries.html',
                    'Error boundary best practices guide'
                ]
            },
            {
                id: `mock_suggestion_2_${Date.now()}`,
                title: 'Add API Documentation',
                description: 'Document API endpoints using OpenAPI/Swagger for better maintainability',
                category: FEEDBACK_CATEGORIES.DOCUMENTATION,
                priority: 'medium',
                effort_estimate: '1-2 hours',
                code_examples: [
                    '/**\n * @swagger\n * /api/users:\n *   get:\n *     summary: Get users\n */',
                    'swagger-jsdoc configuration'
                ],
                resources: [
                    'https://swagger.io/docs/',
                    'API documentation best practices'
                ]
            }
        ];
    }

    _generateMockMetrics() {
        return {
            validation_duration_ms: 5000 + Math.random() * 3000,
            deployment_duration_ms: 2000 + Math.random() * 1000,
            analysis_duration_ms: 1500 + Math.random() * 500,
            test_duration_ms: 3000 + Math.random() * 2000,
            files_analyzed: Math.floor(Math.random() * 50) + 10,
            lines_of_code: Math.floor(Math.random() * 5000) + 1000,
            performance_stats: {
                memory_usage: {
                    rss: Math.floor(Math.random() * 100000000) + 50000000,
                    heapTotal: Math.floor(Math.random() * 50000000) + 25000000,
                    heapUsed: Math.floor(Math.random() * 40000000) + 20000000
                },
                cpu_time: {
                    user: Math.floor(Math.random() * 1000000),
                    system: Math.floor(Math.random() * 500000)
                }
            }
        };
    }

    _generateMockCodeAnalysis() {
        return {
            analysis_id: `mock_analysis_${Date.now()}`,
            syntax_analysis: {
                valid: true,
                errors: [],
                warnings: Math.floor(Math.random() * 3),
                total_lines: Math.floor(Math.random() * 3000) + 500,
                total_files: Math.floor(Math.random() * 30) + 5
            },
            style_analysis: {
                score: Math.floor(Math.random() * 30) + 70,
                issues: Math.floor(Math.random() * 10),
                categories: {
                    indentation: Math.floor(Math.random() * 3),
                    naming: Math.floor(Math.random() * 2),
                    spacing: Math.floor(Math.random() * 4)
                }
            },
            complexity_analysis: {
                average_complexity: Math.round((Math.random() * 5 + 2) * 10) / 10,
                max_complexity: Math.floor(Math.random() * 8) + 5,
                high_complexity_functions: Math.floor(Math.random() * 3)
            },
            security_analysis: {
                vulnerabilities: [],
                risk_score: 'low',
                scanned_patterns: 150,
                potential_issues: Math.floor(Math.random() * 2)
            },
            performance_analysis: {
                potential_issues: Math.floor(Math.random() * 3),
                optimization_opportunities: Math.floor(Math.random() * 5)
            },
            maintainability_analysis: {
                score: Math.floor(Math.random() * 25) + 70,
                technical_debt_ratio: Math.round(Math.random() * 10 * 10) / 10
            },
            dependencies: this._generateMockDependencies(),
            file_analysis: {},
            analysis_timestamp: new Date(),
            tool_versions: {
                eslint: '8.45.0',
                sonarjs: '0.20.0',
                jshint: '2.13.6'
            }
        };
    }

    _generateMockTestResults() {
        const total_tests = Math.floor(Math.random() * 50) + 20;
        const passed_tests = Math.floor(total_tests * (0.8 + Math.random() * 0.15));
        const failed_tests = Math.floor((total_tests - passed_tests) * 0.7);
        const skipped_tests = total_tests - passed_tests - failed_tests;

        return {
            test_id: `mock_test_${Date.now()}`,
            status: failed_tests === 0 ? 'passed' : 'failed',
            total_tests,
            passed_tests,
            failed_tests,
            skipped_tests,
            coverage_percentage: Math.floor(Math.random() * 30) + 65,
            test_failures: failed_tests > 0 ? this._generateMockTestFailures(failed_tests) : [],
            test_warnings: [],
            coverage_report: {
                statements: Math.floor(Math.random() * 30) + 70,
                branches: Math.floor(Math.random() * 25) + 65,
                functions: Math.floor(Math.random() * 35) + 60,
                lines: Math.floor(Math.random() * 30) + 70
            },
            execution_timestamp: new Date(),
            execution_duration_ms: Math.floor(Math.random() * 5000) + 2000,
            environment_info: {
                test_framework: 'jest',
                node_version: 'v18.17.0',
                test_environment: 'jsdom'
            }
        };
    }

    _generateMockComplianceResults() {
        const compliance_score = Math.floor(Math.random() * 30) + 70;
        
        return {
            compliance_id: `mock_compliance_${Date.now()}`,
            status: compliance_score >= 80 ? 'compliant' : 'partial',
            requirement_checks: this._generateMockRequirementChecks(),
            missing_requirements: compliance_score < 90 ? ['API documentation', 'Error handling'] : [],
            exceeded_requirements: ['Code organization', 'Type safety'],
            compliance_score,
            detailed_analysis: {
                functional_requirements: compliance_score + Math.floor(Math.random() * 10) - 5,
                non_functional_requirements: compliance_score + Math.floor(Math.random() * 15) - 7,
                technical_requirements: compliance_score + Math.floor(Math.random() * 8) - 4
            },
            check_timestamp: new Date(),
            recommendations: [
                'Add comprehensive error handling',
                'Improve API documentation',
                'Implement input validation'
            ]
        };
    }

    _generateMockFileList() {
        const files = [
            'src/index.js',
            'src/App.js',
            'src/components/Header.js',
            'src/components/Footer.js',
            'src/utils/helpers.js',
            'src/services/api.js',
            'package.json',
            'README.md',
            'tests/App.test.js'
        ];
        
        return files.slice(0, Math.floor(Math.random() * files.length) + 3);
    }

    _generateMockDependencies() {
        const deps = [
            'react', 'react-dom', 'lodash', 'axios', 'moment',
            'express', 'cors', 'helmet', 'joi', 'bcrypt'
        ];
        
        return deps.slice(0, Math.floor(Math.random() * deps.length) + 3);
    }

    _generateMockTestFailures(count) {
        const failures = [];
        for (let i = 0; i < count; i++) {
            failures.push({
                test_name: `Mock Test ${i + 1}`,
                error_message: 'Expected value to be truthy but received false',
                stack_trace: 'at Object.<anonymous> (test.js:42:5)',
                file_path: `tests/component${i + 1}.test.js`,
                line_number: 42 + i
            });
        }
        return failures;
    }

    _generateMockRequirementChecks() {
        return [
            { requirement: 'User authentication', status: 'met', score: 95 },
            { requirement: 'Data validation', status: 'met', score: 88 },
            { requirement: 'Error handling', status: 'partial', score: 72 },
            { requirement: 'Performance optimization', status: 'met', score: 85 }
        ];
    }

    _getRandomStrengths() {
        const strengths = [
            'Clean code structure',
            'Good separation of concerns',
            'Comprehensive test coverage',
            'Well-documented APIs',
            'Efficient algorithms',
            'Proper error handling',
            'Security best practices',
            'Performance optimizations'
        ];
        
        return strengths.slice(0, Math.floor(Math.random() * 3) + 2);
    }

    _getRandomWeaknesses() {
        const weaknesses = [
            'Test coverage could be improved',
            'Some code complexity issues',
            'Documentation needs enhancement',
            'Error handling could be more robust',
            'Performance optimizations needed',
            'Security considerations missing',
            'Code style inconsistencies',
            'Dependency management issues'
        ];
        
        return weaknesses.slice(0, Math.floor(Math.random() * 2) + 1);
    }

    async _simulateDelay(ms = null) {
        const delay = ms || this.config.response_delay;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

/**
 * Mock Claude Code Client
 * Simulates agentapi communication with Claude Code
 */
export class MockClaudeCodeClient extends ClaudeCodeClient {
    constructor(config = {}) {
        super(config);
        this.mock_config = {
            response_delay: 800,
            success_rate: 0.9,
            ...config.mock_options
        };
    }

    async analyze_pr(pr_info, analysis_options = {}) {
        await this._simulateDelay();
        
        return {
            analysis_id: `mock_claude_analysis_${Date.now()}`,
            status: 'completed',
            code_quality: {
                score: Math.floor(Math.random() * 30) + 70,
                issues: Math.floor(Math.random() * 5),
                suggestions: [
                    'Consider extracting complex logic into separate functions',
                    'Add type annotations for better code clarity'
                ]
            },
            functionality: {
                score: Math.floor(Math.random() * 25) + 75,
                requirements_met: Math.floor(Math.random() * 3) + 8,
                missing_features: []
            },
            recommendations: [
                'Implement comprehensive error handling',
                'Add integration tests for critical paths',
                'Consider performance optimizations for data processing'
            ],
            timestamp: new Date()
        };
    }

    async run_tests(deployment, test_options = {}) {
        await this._simulateDelay(1200);
        
        return {
            test_run_id: `mock_claude_test_${Date.now()}`,
            status: 'completed',
            results: {
                total: Math.floor(Math.random() * 30) + 20,
                passed: Math.floor(Math.random() * 25) + 18,
                failed: Math.floor(Math.random() * 3),
                coverage: Math.floor(Math.random() * 25) + 70
            },
            insights: [
                'Test coverage is adequate for core functionality',
                'Consider adding edge case tests',
                'Integration tests would improve confidence'
            ],
            timestamp: new Date()
        };
    }

    async get_improvement_suggestions(analysis_results, task_context) {
        await this._simulateDelay(600);
        
        return {
            suggestion_id: `mock_claude_suggestions_${Date.now()}`,
            suggestions: [
                {
                    category: 'architecture',
                    priority: 'high',
                    description: 'Consider implementing a service layer for better separation of concerns',
                    impact: 'Improved maintainability and testability'
                },
                {
                    category: 'performance',
                    priority: 'medium',
                    description: 'Optimize database queries by adding appropriate indexes',
                    impact: 'Reduced response times and better scalability'
                },
                {
                    category: 'security',
                    priority: 'high',
                    description: 'Implement input validation and sanitization',
                    impact: 'Enhanced security and data integrity'
                }
            ],
            timestamp: new Date()
        };
    }

    async health_check() {
        await this._simulateDelay(200);
        
        return {
            status: 'healthy',
            version: '1.0.0-mock',
            uptime: Math.floor(Math.random() * 86400000), // Random uptime in ms
            capabilities: [
                'code_analysis',
                'test_execution',
                'improvement_suggestions',
                'security_scanning'
            ],
            timestamp: new Date()
        };
    }

    async _simulateDelay(ms = null) {
        const delay = ms || this.mock_config.response_delay;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

/**
 * Factory function to create mock validator instances
 */
export function createMockValidator(config = {}) {
    return new MockClaudeCodeValidator(config);
}

/**
 * Factory function to create mock Claude Code client instances
 */
export function createMockClaudeCodeClient(config = {}) {
    return new MockClaudeCodeClient(config);
}

/**
 * Utility function to generate sample validation scenarios for testing
 */
export function generateSampleValidationScenarios() {
    return [
        {
            name: 'High Quality PR',
            pr_info: {
                url: 'https://github.com/test/repo/pull/123',
                number: 123,
                branch_name: 'feature/user-authentication',
                head_sha: 'abc123def456',
                base_branch: 'main',
                repository: 'test/repo',
                changed_files: ['src/auth.js', 'tests/auth.test.js'],
                metadata: { lines_added: 150, lines_removed: 20 }
            },
            task_context: {
                task_id: 'TASK-001',
                title: 'Implement user authentication',
                description: 'Add secure user authentication with JWT tokens',
                requirements: ['JWT implementation', 'Password hashing', 'Login/logout endpoints'],
                acceptance_criteria: { security: 'high', performance: 'medium' },
                priority: 'high',
                metadata: { estimated_hours: 8 }
            },
            expected_score: 85
        },
        {
            name: 'Medium Quality PR',
            pr_info: {
                url: 'https://github.com/test/repo/pull/124',
                number: 124,
                branch_name: 'feature/data-processing',
                head_sha: 'def456ghi789',
                base_branch: 'main',
                repository: 'test/repo',
                changed_files: ['src/processor.js', 'src/utils.js'],
                metadata: { lines_added: 200, lines_removed: 50 }
            },
            task_context: {
                task_id: 'TASK-002',
                title: 'Implement data processing pipeline',
                description: 'Process and transform incoming data',
                requirements: ['Data validation', 'Transformation logic', 'Error handling'],
                acceptance_criteria: { performance: 'high', reliability: 'high' },
                priority: 'medium',
                metadata: { estimated_hours: 12 }
            },
            expected_score: 72
        },
        {
            name: 'Low Quality PR',
            pr_info: {
                url: 'https://github.com/test/repo/pull/125',
                number: 125,
                branch_name: 'hotfix/quick-fix',
                head_sha: 'ghi789jkl012',
                base_branch: 'main',
                repository: 'test/repo',
                changed_files: ['src/legacy.js'],
                metadata: { lines_added: 30, lines_removed: 5 }
            },
            task_context: {
                task_id: 'TASK-003',
                title: 'Fix critical bug',
                description: 'Quick fix for production issue',
                requirements: ['Bug fix', 'No regression'],
                acceptance_criteria: { urgency: 'critical' },
                priority: 'critical',
                metadata: { estimated_hours: 2 }
            },
            expected_score: 58
        }
    ];
}

export default {
    MockClaudeCodeValidator,
    MockClaudeCodeClient,
    createMockValidator,
    createMockClaudeCodeClient,
    generateSampleValidationScenarios
};

