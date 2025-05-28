/**
 * @fileoverview Codegen Integration Module
 * @description Main entry point for Codegen integration with automated PR creation system
 */

export { CodegenAuth } from './auth.js';
export { CodegenClient } from './client.js';
export { PromptGenerator } from './prompt_generator.js';
export { PRManager } from './pr_manager.js';
export { FeedbackHandler } from './feedback_handler.js';

// Default export for convenience
export { CodegenClient as default } from './client.js';

/**
 * Create a fully configured Codegen integration instance
 * @param {Object} config - Configuration object
 * @returns {CodegenClient} Configured Codegen client
 */
export function createCodegenIntegration(config = {}) {
    return new CodegenClient(config);
}

/**
 * Integration metadata
 */
export const INTEGRATION_INFO = {
    name: 'Codegen Integration',
    version: '1.0.0',
    description: 'Automated PR creation system with database task retrieval and intelligent error handling',
    author: 'Claude Task Master Team',
    components: [
        'CodegenAuth',
        'CodegenClient', 
        'PromptGenerator',
        'PRManager',
        'FeedbackHandler'
    ],
    features: [
        'Database task retrieval via Cloudflare API',
        'Natural language to Codegen prompt conversion',
        'Automated PR creation with proper formatting',
        'Intelligent error handling and retry mechanisms',
        'Context preservation across PR creation cycles',
        'Quality assurance and validation integration',
        'Performance monitoring and metrics collection'
    ]
};

