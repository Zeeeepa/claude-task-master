/**
 * claude_code_validator/interfaces/validator.js
 * 
 * Core validator interface definitions for the Claude Code validation system.
 * These interfaces define the contracts that enable maximum concurrency by
 * allowing multiple teams to develop against stable APIs.
 */

import {
    PRInfo,
    TaskContext,
    ValidationResult,
    DeploymentResult,
    ValidationSuite,
    ValidationFeedback,
    ValidationMetrics
} from './types.js';

/**
 * Core Claude Code Validator Interface
 * 
 * This is the main interface for the validation system that integrates with
 * Claude Code via agentapi for comprehensive PR validation.
 */
export class ClaudeCodeValidator {
    /**
     * Validates a PR implementation against task requirements
     * 
     * @param {PRInfo} pr_info - Information about the PR to validate
     * @param {TaskContext} task_context - Context about the associated task
     * @returns {Promise<ValidationResult>} Complete validation results
     * @throws {Error} If validation fails due to system errors
     */
    async validate_pr(pr_info, task_context) {
        throw new Error('validate_pr method must be implemented by subclass');
    }

    /**
     * Deploys a PR branch to local development environment
     * 
     * @param {PRInfo} pr_info - Information about the PR to deploy
     * @returns {Promise<DeploymentResult>} Deployment results and environment info
     * @throws {Error} If deployment fails
     */
    async deploy_pr_branch(pr_info) {
        throw new Error('deploy_pr_branch method must be implemented by subclass');
    }

    /**
     * Runs comprehensive validation suite on deployed code
     * 
     * @param {DeploymentResult} deployment - Results from PR deployment
     * @returns {Promise<ValidationSuite>} Complete validation suite results
     * @throws {Error} If validation suite execution fails
     */
    async run_validation_suite(deployment) {
        throw new Error('run_validation_suite method must be implemented by subclass');
    }

    /**
     * Generates intelligent feedback based on validation results
     * 
     * @param {ValidationSuite} validation - Validation suite results
     * @returns {Promise<ValidationFeedback[]>} Array of feedback items
     * @throws {Error} If feedback generation fails
     */
    async generate_feedback(validation) {
        throw new Error('generate_feedback method must be implemented by subclass');
    }

    /**
     * Tracks validation metrics and performance data
     * 
     * @param {ValidationResult} validation - Complete validation results
     * @returns {Promise<void>} Resolves when metrics are stored
     * @throws {Error} If metrics tracking fails
     */
    async track_validation_metrics(validation) {
        throw new Error('track_validation_metrics method must be implemented by subclass');
    }
}

/**
 * Claude Code Client Interface
 * 
 * Interface for communicating with Claude Code via agentapi.
 * This abstraction allows for easy mocking and testing.
 */
export class ClaudeCodeClient {
    /**
     * Initializes connection to Claude Code via agentapi
     * 
     * @param {Object} config - Configuration for agentapi connection
     * @param {string} config.agentapi_url - Base URL for agentapi
     * @param {string} config.api_key - API key for authentication
     * @param {Object} config.options - Additional connection options
     */
    constructor(config) {
        this.config = config;
    }

    /**
     * Requests Claude Code to analyze a PR
     * 
     * @param {PRInfo} pr_info - PR information
     * @param {Object} analysis_options - Analysis configuration
     * @returns {Promise<Object>} Claude Code analysis results
     * @throws {Error} If analysis request fails
     */
    async analyze_pr(pr_info, analysis_options = {}) {
        throw new Error('analyze_pr method must be implemented by subclass');
    }

    /**
     * Requests Claude Code to run tests on deployed code
     * 
     * @param {DeploymentResult} deployment - Deployment information
     * @param {Object} test_options - Test configuration
     * @returns {Promise<Object>} Test execution results
     * @throws {Error} If test execution fails
     */
    async run_tests(deployment, test_options = {}) {
        throw new Error('run_tests method must be implemented by subclass');
    }

    /**
     * Requests Claude Code to provide code improvement suggestions
     * 
     * @param {Object} analysis_results - Code analysis results
     * @param {TaskContext} task_context - Task context for targeted suggestions
     * @returns {Promise<Object>} Improvement suggestions
     * @throws {Error} If suggestion generation fails
     */
    async get_improvement_suggestions(analysis_results, task_context) {
        throw new Error('get_improvement_suggestions method must be implemented by subclass');
    }

    /**
     * Checks the health and availability of Claude Code
     * 
     * @returns {Promise<Object>} Health check results
     * @throws {Error} If health check fails
     */
    async health_check() {
        throw new Error('health_check method must be implemented by subclass');
    }
}

/**
 * Deployment Manager Interface
 * 
 * Handles the deployment of PR branches to local development environments
 * for validation and testing.
 */
export class DeploymentManager {
    /**
     * Deploys a PR branch to a local environment
     * 
     * @param {string} pr_url - URL of the PR to deploy
     * @param {string} branch_name - Name of the branch to deploy
     * @param {Object} deployment_options - Deployment configuration
     * @returns {Promise<DeploymentResult>} Deployment results
     * @throws {Error} If deployment fails
     */
    async deploy_pr_to_environment(pr_url, branch_name, deployment_options = {}) {
        throw new Error('deploy_pr_to_environment method must be implemented by subclass');
    }

    /**
     * Cleans up a deployed environment
     * 
     * @param {string} deployment_id - ID of the deployment to clean up
     * @returns {Promise<void>} Resolves when cleanup is complete
     * @throws {Error} If cleanup fails
     */
    async cleanup_deployment(deployment_id) {
        throw new Error('cleanup_deployment method must be implemented by subclass');
    }

    /**
     * Gets information about a deployed environment
     * 
     * @param {string} deployment_id - ID of the deployment
     * @returns {Promise<Object>} Environment information
     * @throws {Error} If environment info retrieval fails
     */
    async get_environment_info(deployment_id) {
        throw new Error('get_environment_info method must be implemented by subclass');
    }
}

/**
 * Validation Engine Interface
 * 
 * Core engine for running various types of code validation and analysis.
 */
export class ValidationEngine {
    /**
     * Runs comprehensive code analysis
     * 
     * @param {string} deployment_path - Path to deployed code
     * @param {Object} analysis_options - Analysis configuration
     * @returns {Promise<Object>} Code analysis results
     * @throws {Error} If analysis fails
     */
    async run_code_analysis(deployment_path, analysis_options = {}) {
        throw new Error('run_code_analysis method must be implemented by subclass');
    }

    /**
     * Executes test suite on deployed code
     * 
     * @param {string} deployment_path - Path to deployed code
     * @param {Object} test_options - Test configuration
     * @returns {Promise<Object>} Test execution results
     * @throws {Error} If test execution fails
     */
    async execute_test_suite(deployment_path, test_options = {}) {
        throw new Error('execute_test_suite method must be implemented by subclass');
    }

    /**
     * Checks compliance with task requirements
     * 
     * @param {Object} code_analysis - Code analysis results
     * @param {TaskContext} task - Task context and requirements
     * @returns {Promise<Object>} Compliance check results
     * @throws {Error} If compliance check fails
     */
    async check_requirements_compliance(code_analysis, task) {
        throw new Error('check_requirements_compliance method must be implemented by subclass');
    }
}

/**
 * Feedback Generator Interface
 * 
 * Generates intelligent, actionable feedback based on validation results.
 */
export class FeedbackGenerator {
    /**
     * Generates improvement feedback from validation results
     * 
     * @param {Object} validation_results - Combined validation results
     * @param {TaskContext} task_context - Task context for targeted feedback
     * @returns {Promise<ValidationFeedback[]>} Array of feedback items
     * @throws {Error} If feedback generation fails
     */
    async generate_improvement_feedback(validation_results, task_context) {
        throw new Error('generate_improvement_feedback method must be implemented by subclass');
    }

    /**
     * Calculates validation scores from results
     * 
     * @param {Object} validation_results - Combined validation results
     * @returns {Promise<Object>} Calculated scores and grades
     * @throws {Error} If score calculation fails
     */
    async calculate_validation_score(validation_results) {
        throw new Error('calculate_validation_score method must be implemented by subclass');
    }

    /**
     * Generates summary report of validation results
     * 
     * @param {ValidationResult} validation_result - Complete validation results
     * @returns {Promise<Object>} Summary report
     * @throws {Error} If report generation fails
     */
    async generate_summary_report(validation_result) {
        throw new Error('generate_summary_report method must be implemented by subclass');
    }
}

/**
 * Metrics Tracker Interface
 * 
 * Tracks and stores validation metrics for performance monitoring and improvement.
 */
export class MetricsTracker {
    /**
     * Stores validation results and metrics
     * 
     * @param {string} task_id - Associated task ID
     * @param {ValidationResult} validation - Complete validation results
     * @returns {Promise<void>} Resolves when storage is complete
     * @throws {Error} If storage fails
     */
    async store_validation_results(task_id, validation) {
        throw new Error('store_validation_results method must be implemented by subclass');
    }

    /**
     * Retrieves historical validation metrics
     * 
     * @param {string} task_id - Task ID to retrieve metrics for
     * @param {Object} options - Query options (date range, etc.)
     * @returns {Promise<Object[]>} Array of historical metrics
     * @throws {Error} If retrieval fails
     */
    async get_validation_history(task_id, options = {}) {
        throw new Error('get_validation_history method must be implemented by subclass');
    }

    /**
     * Generates performance analytics
     * 
     * @param {Object} query_options - Analytics query parameters
     * @returns {Promise<Object>} Performance analytics data
     * @throws {Error} If analytics generation fails
     */
    async generate_performance_analytics(query_options = {}) {
        throw new Error('generate_performance_analytics method must be implemented by subclass');
    }
}

// Export all interfaces
export {
    ClaudeCodeValidator,
    ClaudeCodeClient,
    DeploymentManager,
    ValidationEngine,
    FeedbackGenerator,
    MetricsTracker
};

