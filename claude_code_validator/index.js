/**
 * claude_code_validator/index.js
 * 
 * Main entry point for the Claude Code validation system.
 * Exports all public interfaces and provides factory functions for easy integration.
 */

// Core interfaces and types
export {
    ClaudeCodeValidator,
    ClaudeCodeClient,
    DeploymentManager,
    ValidationEngine,
    FeedbackGenerator,
    MetricsTracker
} from './interfaces/validator.js';

export {
    VALIDATION_CRITERIA,
    VALIDATION_STATUS,
    FEEDBACK_TYPES,
    FEEDBACK_CATEGORIES,
    SEVERITY_LEVELS
} from './interfaces/types.js';

// Core implementation
export {
    validate_pr_implementation,
    deploy_pr_to_environment,
    run_code_analysis,
    execute_test_suite,
    check_requirements_compliance,
    generate_improvement_feedback,
    calculate_validation_score,
    store_validation_results,
    ClaudeCodeValidatorImpl,
    DeploymentManagerImpl,
    ValidationEngineImpl,
    FeedbackGeneratorImpl,
    MetricsTrackerImpl
} from './core/claude_code_validator.js';

// Mock implementations for testing
export {
    MockClaudeCodeValidator,
    MockClaudeCodeClient,
    createMockValidator,
    createMockClaudeCodeClient,
    generateSampleValidationScenarios
} from './mocks/mock_validator.js';

// Validation engine components
export { CodeAnalyzer } from '../validation_engine/analyzers/code_analyzer.js';
export { ScoreCalculator } from '../validation_engine/scoring/score_calculator.js';

// Feedback generation components
export { FeedbackProcessor } from '../feedback_generator/processors/feedback_processor.js';

import { log } from '../scripts/modules/utils.js';
import { ClaudeCodeValidatorImpl } from './core/claude_code_validator.js';
import { MockClaudeCodeValidator } from './mocks/mock_validator.js';

/**
 * Factory function to create a Claude Code validator instance
 * 
 * @param {Object} config - Configuration options
 * @param {boolean} config.use_mock - Whether to use mock implementation
 * @param {string} config.agentapi_url - AgentAPI URL for Claude Code integration
 * @param {string} config.api_key - API key for authentication
 * @param {Object} config.validation_options - Validation configuration
 * @returns {ClaudeCodeValidator} Validator instance
 */
export function createValidator(config = {}) {
    log('info', 'Creating Claude Code validator instance');
    
    if (config.use_mock) {
        log('debug', 'Using mock validator for testing/development');
        return new MockClaudeCodeValidator(config.mock_options || {});
    }
    
    log('debug', 'Using production validator implementation');
    return new ClaudeCodeValidatorImpl(config);
}

/**
 * Convenience function for quick PR validation
 * 
 * @param {Object} pr_info - PR information
 * @param {Object} task_context - Task context
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation results
 */
export async function validatePR(pr_info, task_context, options = {}) {
    const validator = createValidator(options);
    return await validator.validate_pr(pr_info, task_context);
}

/**
 * Convenience function for code analysis only
 * 
 * @param {string} code_path - Path to code to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeCode(code_path, options = {}) {
    const { CodeAnalyzer } = await import('../validation_engine/analyzers/code_analyzer.js');
    const analyzer = new CodeAnalyzer(options);
    return await analyzer.analyze(code_path, options);
}

/**
 * Convenience function for score calculation only
 * 
 * @param {Object} validation_results - Validation results
 * @param {Object} options - Scoring options
 * @returns {Promise<Object>} Calculated scores
 */
export async function calculateScores(validation_results, options = {}) {
    const { ScoreCalculator } = await import('../validation_engine/scoring/score_calculator.js');
    const calculator = new ScoreCalculator(options);
    return await calculator.calculate_scores(validation_results);
}

/**
 * Convenience function for feedback generation only
 * 
 * @param {Object} validation_results - Validation results
 * @param {Object} task_context - Task context
 * @param {Object} options - Feedback options
 * @returns {Promise<Array>} Generated feedback
 */
export async function generateFeedback(validation_results, task_context = {}, options = {}) {
    const { FeedbackProcessor } = await import('../feedback_generator/processors/feedback_processor.js');
    const processor = new FeedbackProcessor(options);
    return await processor.generate_feedback(validation_results, task_context);
}

/**
 * Health check function to verify system components
 * 
 * @param {Object} config - Configuration for health check
 * @returns {Promise<Object>} Health check results
 */
export async function healthCheck(config = {}) {
    log('info', 'Running Claude Code validator health check');
    
    const health_results = {
        timestamp: new Date(),
        status: 'healthy',
        components: {},
        version: '1.0.0'
    };
    
    try {
        // Check core validator
        const validator = createValidator({ use_mock: true });
        health_results.components.validator = { status: 'healthy' };
        
        // Check code analyzer
        const { CodeAnalyzer } = await import('../validation_engine/analyzers/code_analyzer.js');
        const analyzer = new CodeAnalyzer();
        health_results.components.code_analyzer = { status: 'healthy' };
        
        // Check score calculator
        const { ScoreCalculator } = await import('../validation_engine/scoring/score_calculator.js');
        const calculator = new ScoreCalculator();
        health_results.components.score_calculator = { status: 'healthy' };
        
        // Check feedback processor
        const { FeedbackProcessor } = await import('../feedback_generator/processors/feedback_processor.js');
        const processor = new FeedbackProcessor();
        health_results.components.feedback_processor = { status: 'healthy' };
        
        log('info', 'Health check completed successfully');
        
    } catch (error) {
        log('error', `Health check failed: ${error.message}`);
        health_results.status = 'unhealthy';
        health_results.error = error.message;
    }
    
    return health_results;
}

/**
 * Configuration validation function
 * 
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation results
 */
export function validateConfig(config) {
    const validation_results = {
        valid: true,
        errors: [],
        warnings: []
    };
    
    // Check required fields for production use
    if (!config.use_mock) {
        if (!config.agentapi_url) {
            validation_results.errors.push('agentapi_url is required for production use');
        }
        
        if (!config.api_key) {
            validation_results.warnings.push('api_key not provided - some features may not work');
        }
    }
    
    // Check validation criteria
    if (config.validation_criteria) {
        const total_weight = Object.values(config.validation_criteria)
            .reduce((sum, criteria) => sum + (criteria.weight || 0), 0);
        
        if (Math.abs(total_weight - 1.0) > 0.01) {
            validation_results.warnings.push(`Validation criteria weights sum to ${total_weight}, should be 1.0`);
        }
    }
    
    validation_results.valid = validation_results.errors.length === 0;
    
    return validation_results;
}

/**
 * Default configuration for the validation system
 */
export const DEFAULT_CONFIG = {
    use_mock: false,
    agentapi_url: process.env.AGENTAPI_URL || 'http://localhost:8000',
    api_key: process.env.CLAUDE_CODE_API_KEY,
    validation_options: {
        enable_syntax_analysis: true,
        enable_style_analysis: true,
        enable_complexity_analysis: true,
        enable_security_analysis: true,
        enable_performance_analysis: true,
        enable_maintainability_analysis: true
    },
    scoring_options: {
        criteria: VALIDATION_CRITERIA
    },
    feedback_options: {
        max_feedback_items: 20,
        include_code_examples: true,
        include_resources: true
    }
};

// Export version information
export const VERSION = '1.0.0';
export const BUILD_DATE = new Date().toISOString();

log('info', `Claude Code Validator v${VERSION} loaded`);

export default {
    createValidator,
    validatePR,
    analyzeCode,
    calculateScores,
    generateFeedback,
    healthCheck,
    validateConfig,
    DEFAULT_CONFIG,
    VERSION
};

