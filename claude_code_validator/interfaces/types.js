/**
 * claude_code_validator/interfaces/types.js
 * 
 * Core type definitions and interfaces for the Claude Code validation system.
 * This file defines the foundational data structures that enable maximum concurrency
 * by providing clear contracts for all validation components.
 */

/**
 * @typedef {Object} PRInfo
 * @property {string} url - The PR URL
 * @property {number} number - The PR number
 * @property {string} branch_name - The branch name
 * @property {string} head_sha - The head commit SHA
 * @property {string} base_branch - The base branch name
 * @property {string} repository - The repository name
 * @property {Array<string>} changed_files - List of changed files
 * @property {Object} metadata - Additional PR metadata
 */

/**
 * @typedef {Object} TaskContext
 * @property {string} task_id - Unique task identifier
 * @property {string} title - Task title
 * @property {string} description - Task description
 * @property {Array<string>} requirements - List of requirements
 * @property {Object} acceptance_criteria - Acceptance criteria
 * @property {string} priority - Task priority level
 * @property {Object} metadata - Additional task metadata
 */

/**
 * @typedef {Object} ValidationMetrics
 * @property {number} validation_duration_ms - Time taken for validation
 * @property {number} deployment_duration_ms - Time taken for deployment
 * @property {number} analysis_duration_ms - Time taken for code analysis
 * @property {number} test_duration_ms - Time taken for test execution
 * @property {number} files_analyzed - Number of files analyzed
 * @property {number} lines_of_code - Total lines of code analyzed
 * @property {Object} performance_stats - Additional performance statistics
 */

/**
 * @typedef {Object} ValidationFeedback
 * @property {string} id - Unique feedback identifier
 * @property {string} type - Feedback type ('error', 'warning', 'suggestion', 'info')
 * @property {string} category - Feedback category ('code_quality', 'functionality', 'testing', 'documentation')
 * @property {string} title - Feedback title
 * @property {string} message - Detailed feedback message
 * @property {string} file_path - File path where issue was found
 * @property {number} line_number - Line number (if applicable)
 * @property {string} severity - Severity level ('critical', 'high', 'medium', 'low')
 * @property {Array<string>} suggestions - List of improvement suggestions
 * @property {Object} context - Additional context information
 */

/**
 * @typedef {Object} ImprovementSuggestion
 * @property {string} id - Unique suggestion identifier
 * @property {string} title - Suggestion title
 * @property {string} description - Detailed description
 * @property {string} category - Suggestion category
 * @property {string} priority - Priority level
 * @property {string} effort_estimate - Estimated effort to implement
 * @property {Array<string>} code_examples - Example code snippets
 * @property {Array<string>} resources - Helpful resources/links
 */

/**
 * @typedef {Object} ValidationScore
 * @property {number} overall_score - Overall validation score (0-100)
 * @property {number} code_quality_score - Code quality score (0-100)
 * @property {number} functionality_score - Functionality score (0-100)
 * @property {number} testing_score - Testing score (0-100)
 * @property {number} documentation_score - Documentation score (0-100)
 * @property {Object} detailed_scores - Detailed breakdown of scores
 * @property {string} grade - Letter grade (A+, A, B+, B, C+, C, D, F)
 * @property {Array<string>} strengths - List of identified strengths
 * @property {Array<string>} weaknesses - List of identified weaknesses
 */

/**
 * @typedef {Object} ValidationResult
 * @property {string} task_id - Associated task ID
 * @property {number} pr_number - PR number
 * @property {string} status - Validation status ('passed', 'failed', 'needs_improvement', 'error')
 * @property {ValidationScore} score - Validation scores
 * @property {Array<ValidationFeedback>} feedback - List of feedback items
 * @property {Array<ImprovementSuggestion>} suggestions - List of improvement suggestions
 * @property {ValidationMetrics} metrics - Performance and timing metrics
 * @property {Date} validation_timestamp - When validation was performed
 * @property {string} validator_version - Version of the validation engine
 * @property {Object} raw_results - Raw analysis results for debugging
 */

/**
 * @typedef {Object} DeploymentResult
 * @property {string} deployment_id - Unique deployment identifier
 * @property {string} status - Deployment status ('success', 'failed', 'partial')
 * @property {string} deployment_path - Local path where code was deployed
 * @property {string} environment_type - Type of environment ('local', 'container', 'vm')
 * @property {Array<string>} deployed_files - List of successfully deployed files
 * @property {Array<string>} failed_files - List of files that failed to deploy
 * @property {Object} environment_info - Information about the deployment environment
 * @property {Date} deployment_timestamp - When deployment was performed
 * @property {Array<string>} logs - Deployment logs
 * @property {Object} metadata - Additional deployment metadata
 */

/**
 * @typedef {Object} CodeAnalysisResult
 * @property {string} analysis_id - Unique analysis identifier
 * @property {Object} syntax_analysis - Syntax and parsing results
 * @property {Object} style_analysis - Code style analysis results
 * @property {Object} complexity_analysis - Code complexity metrics
 * @property {Object} security_analysis - Security vulnerability analysis
 * @property {Object} performance_analysis - Performance analysis results
 * @property {Object} maintainability_analysis - Maintainability metrics
 * @property {Array<string>} dependencies - Detected dependencies
 * @property {Object} file_analysis - Per-file analysis results
 * @property {Date} analysis_timestamp - When analysis was performed
 * @property {Object} tool_versions - Versions of analysis tools used
 */

/**
 * @typedef {Object} TestResult
 * @property {string} test_id - Unique test execution identifier
 * @property {string} status - Test execution status ('passed', 'failed', 'skipped', 'error')
 * @property {number} total_tests - Total number of tests
 * @property {number} passed_tests - Number of passed tests
 * @property {number} failed_tests - Number of failed tests
 * @property {number} skipped_tests - Number of skipped tests
 * @property {number} coverage_percentage - Code coverage percentage
 * @property {Array<Object>} test_failures - Details of test failures
 * @property {Array<Object>} test_warnings - Test warnings
 * @property {Object} coverage_report - Detailed coverage report
 * @property {Date} execution_timestamp - When tests were executed
 * @property {number} execution_duration_ms - Test execution duration
 * @property {Object} environment_info - Test environment information
 */

/**
 * @typedef {Object} ComplianceResult
 * @property {string} compliance_id - Unique compliance check identifier
 * @property {string} status - Compliance status ('compliant', 'non_compliant', 'partial')
 * @property {Array<Object>} requirement_checks - Results for each requirement
 * @property {Array<Object>} missing_requirements - Requirements not met
 * @property {Array<Object>} exceeded_requirements - Requirements exceeded
 * @property {number} compliance_score - Overall compliance score (0-100)
 * @property {Object} detailed_analysis - Detailed compliance analysis
 * @property {Date} check_timestamp - When compliance was checked
 * @property {Array<string>} recommendations - Compliance recommendations
 */

/**
 * @typedef {Object} ValidationSuite
 * @property {string} suite_id - Unique validation suite identifier
 * @property {CodeAnalysisResult} code_analysis - Code analysis results
 * @property {TestResult} test_results - Test execution results
 * @property {ComplianceResult} compliance_results - Compliance check results
 * @property {Object} integration_tests - Integration test results
 * @property {Object} performance_tests - Performance test results
 * @property {Object} security_tests - Security test results
 * @property {Date} suite_timestamp - When validation suite was executed
 * @property {number} total_duration_ms - Total execution time
 * @property {string} suite_version - Version of the validation suite
 */

// Validation criteria configuration
export const VALIDATION_CRITERIA = {
    code_quality: {
        weight: 0.3,
        checks: ['style', 'complexity', 'maintainability', 'readability'],
        thresholds: {
            style_score: 80,
            complexity_score: 70,
            maintainability_score: 75
        }
    },
    functionality: {
        weight: 0.4,
        checks: ['requirements_met', 'edge_cases', 'error_handling', 'api_compliance'],
        thresholds: {
            requirements_coverage: 90,
            edge_case_coverage: 70,
            error_handling_score: 80
        }
    },
    testing: {
        weight: 0.2,
        checks: ['test_coverage', 'test_quality', 'regression_tests', 'integration_tests'],
        thresholds: {
            code_coverage: 80,
            test_quality_score: 75,
            regression_coverage: 90
        }
    },
    documentation: {
        weight: 0.1,
        checks: ['code_comments', 'docstrings', 'readme_updates', 'api_docs'],
        thresholds: {
            comment_coverage: 60,
            docstring_coverage: 70,
            documentation_score: 65
        }
    }
};

// Validation status constants
export const VALIDATION_STATUS = {
    PASSED: 'passed',
    FAILED: 'failed',
    NEEDS_IMPROVEMENT: 'needs_improvement',
    ERROR: 'error',
    IN_PROGRESS: 'in_progress',
    PENDING: 'pending'
};

// Feedback types and categories
export const FEEDBACK_TYPES = {
    ERROR: 'error',
    WARNING: 'warning',
    SUGGESTION: 'suggestion',
    INFO: 'info'
};

export const FEEDBACK_CATEGORIES = {
    CODE_QUALITY: 'code_quality',
    FUNCTIONALITY: 'functionality',
    TESTING: 'testing',
    DOCUMENTATION: 'documentation',
    SECURITY: 'security',
    PERFORMANCE: 'performance'
};

// Severity levels
export const SEVERITY_LEVELS = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
};

// Export all types for use in other modules
export {
    PRInfo,
    TaskContext,
    ValidationMetrics,
    ValidationFeedback,
    ImprovementSuggestion,
    ValidationScore,
    ValidationResult,
    DeploymentResult,
    CodeAnalysisResult,
    TestResult,
    ComplianceResult,
    ValidationSuite
};

