/**
 * AgentAPI Middleware Integration
 *
 * Main entry point for the AgentAPI middleware system.
 * Exports all components for easy integration with the System Orchestrator.
 */

export { MiddlewareServer } from './middleware-server.js';
export { APIRouter } from './api-router.js';
export { AuthHandler } from './auth-handler.js';
export { DataTransformer } from './data-transformer.js';
export { RateLimiter } from './rate-limiter.js';

// Default export for convenience
export { MiddlewareServer as default } from './middleware-server.js';
