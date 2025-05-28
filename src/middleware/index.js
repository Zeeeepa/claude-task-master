/**
 * AgentAPI Middleware Integration - Main Export
 * 
 * Consolidated middleware system that combines functionality from:
 * - PR #74: AgentAPI Middleware Integration - Comprehensive Communication Bridge
 * - PR #81: Implement AgentAPI Middleware Integration (ZAM-689)
 * - PR #82: SUB-ISSUE 3: AgentAPI Middleware Integration for Claude Code Orchestration
 * - PR #85: AgentAPI Middleware Integration for Claude Code Communication (ZAM-673)
 * 
 * This unified implementation provides:
 * - Real-time communication with Claude Code instances
 * - Task queue management with priority scheduling
 * - Instance lifecycle management
 * - Event stream processing with SSE
 * - WSL2 integration and deployment orchestration
 * - Error recovery and retry mechanisms
 * - Performance monitoring and health checking
 */

// Main middleware class
export { AgentAPIMiddleware } from './agentapi-middleware.js';

// Core components
export { AgentAPIClient } from './agentapi-client.js';
export { ClaudeCodeManager } from './claude-code-manager.js';
export { TaskQueue } from './task-queue.js';
export { EventProcessor } from './event-processor.js';
export { WSL2Manager } from './wsl2-manager.js';
export { DeploymentOrchestrator } from './deployment-orchestrator.js';

// Configuration
export { AgentAPIConfig } from '../config/agentapi-config.js';

// Default export
export default AgentAPIMiddleware;

