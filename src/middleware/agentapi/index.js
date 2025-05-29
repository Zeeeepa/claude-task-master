/**
 * AgentAPI Middleware
 * HTTP API bridge between Task Master orchestrator and Claude Code instances
 */

export { AgentAPIServer } from './server.js';
export { ClaudeInterface } from './claude-interface.js';
export { MessageHandler } from './message-handler.js';
export { SessionManager } from './session-manager.js';
export { AgentAPIClient } from './client.js';
export { MessageQueue } from './queue.js';
export { MessageProcessor } from './processor.js';

// Default export for convenience
export { AgentAPIServer as default } from './server.js';

