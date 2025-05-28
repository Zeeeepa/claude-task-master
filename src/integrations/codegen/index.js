/**
 * Codegen SDK Integration - Main Export
 * 
 * Consolidated Codegen integration that combines functionality from:
 * - PR #83: Enhanced Codegen Integration (PR #22 Extension) - ZAM-629
 * - PR #86: Implement comprehensive Codegen SDK integration for natural language to PR creation
 * - PR #87: SUB-ISSUE 2: Real Codegen SDK Integration & Natural Language Processing Engine
 * 
 * This unified implementation provides:
 * - Natural language processing and task analysis
 * - Database-driven prompt generation with context enrichment
 * - Webhook integration with GitHub and Linear
 * - Advanced error recovery with circuit breaker
 * - Template management and versioning
 * - Real-time status tracking and notifications
 * - Comprehensive validation and testing framework
 */

// Main integration class
export { CodegenSDKIntegration } from './codegen-sdk-integration.js';

// Core components
export { CodegenClient } from './codegen-client.js';

// Default export
export default CodegenSDKIntegration;

