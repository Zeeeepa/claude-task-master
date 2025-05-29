/**
 * @fileoverview Main entry point for codegen integration system
 * Exports all public APIs and provides convenient access to the integration system
 */

// Core classes
export { CodegenIntegration, createCodegenIntegration } from './integration.js';
export { CodegenClient, createCodegenClient } from './codegen_client.js';
export { PRTracker, createPRTracker } from './pr_tracker.js';

// Prompt generation
export { PromptGenerator, createPromptGenerator } from '../prompt_generation/prompt_generator.js';
export { 
    getTemplate, 
    getAvailableTemplateTypes,
    TEMPLATE_REGISTRY,
    IMPLEMENTATION_PROMPT,
    BUG_FIX_PROMPT,
    FEATURE_PROMPT,
    REFACTOR_PROMPT,
    DOCUMENTATION_PROMPT,
    TESTING_PROMPT
} from '../prompt_generation/templates.js';

// Types and constants
export {
    TASK_TYPES,
    CODEGEN_STATUS,
    PR_STATUS
} from './types.js';

// Convenience functions
export {
    generateTaskPrompt,
    sendToCodegen,
    parseCodegenResponse,
    trackPRCreation
} from './integration.js';

/**
 * Create a complete codegen integration system with all components
 * @param {Object} options - Configuration options
 * @param {Object} options.promptGenerator - Prompt generator options
 * @param {Object} options.codegenClient - Codegen client options
 * @param {Object} options.prTracker - PR tracker options
 * @param {boolean} options.enableTracking - Whether to enable PR tracking
 * @returns {CodegenIntegration} Configured integration system
 */
export function createCompleteIntegration(options = {}) {
    return createCodegenIntegration({
        enableTracking: true,
        maxRetries: 3,
        retryDelay: 2000,
        ...options
    });
}

/**
 * Create a minimal codegen integration for simple use cases
 * @param {Object} options - Configuration options
 * @returns {CodegenIntegration} Minimal integration system
 */
export function createMinimalIntegration(options = {}) {
    return createCodegenIntegration({
        enableTracking: false,
        maxRetries: 1,
        ...options
    });
}

/**
 * Default configuration for production use
 */
export const DEFAULT_PRODUCTION_CONFIG = {
    promptGenerator: {
        maxContextSize: 8000,
        includeCodeExamples: true,
        enhanceWithBestPractices: true
    },
    codegenClient: {
        timeout: 60000,
        retryAttempts: 3,
        retryDelay: 2000
    },
    prTracker: {
        storageBackend: 'database' // Would be implemented in production
    },
    enableTracking: true,
    maxRetries: 3
};

/**
 * Default configuration for development/testing
 */
export const DEFAULT_DEVELOPMENT_CONFIG = {
    promptGenerator: {
        maxContextSize: 4000,
        includeCodeExamples: false,
        enhanceWithBestPractices: false
    },
    codegenClient: {
        timeout: 30000,
        retryAttempts: 1,
        retryDelay: 1000
    },
    prTracker: {
        storageBackend: 'memory'
    },
    enableTracking: true,
    maxRetries: 1
};

export default {
    // Main classes
    CodegenIntegration,
    CodegenClient,
    PRTracker,
    PromptGenerator,
    
    // Factory functions
    createCodegenIntegration,
    createCodegenClient,
    createPRTracker,
    createPromptGenerator,
    createCompleteIntegration,
    createMinimalIntegration,
    
    // Constants
    TASK_TYPES,
    CODEGEN_STATUS,
    PR_STATUS,
    
    // Configurations
    DEFAULT_PRODUCTION_CONFIG,
    DEFAULT_DEVELOPMENT_CONFIG
};

