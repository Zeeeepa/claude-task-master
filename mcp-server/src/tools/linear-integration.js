/**
 * mcp-server/src/tools/linear-integration.js
 * MCP tools for Linear integration
 */

import { z } from 'zod';
import {
	createErrorResponse,
	handleApiResult,
	withNormalizedProjectRoot
} from './utils.js';
import { LinearIntegration } from '../../../integrations/linear/index.js';

// Global Linear integration instance
let linearIntegration = null;

/**
 * Initialize Linear integration if not already done
 */
async function ensureLinearIntegration(config = {}) {
	if (!linearIntegration) {
		linearIntegration = new LinearIntegration(config);
		await linearIntegration.initialize();
	}
	return linearIntegration;
}

/**
 * Register Linear integration tools with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerLinearIntegrationTools(server) {
	// Initialize Linear integration
	server.addTool({
		name: 'linear_initialize',
		description: 'Initialize Linear integration with configuration',
		parameters: z.object({
			apiKey: z.string().optional().describe('Linear API key (or use LINEAR_API_KEY env var)'),
			teamId: z.string().optional().describe('Linear team ID (or use LINEAR_TEAM_ID env var)'),
			projectId: z.string().optional().describe('Linear project ID (optional)'),
			enableAutoSync: z.boolean().optional().describe('Enable automatic synchronization (default: true)'),
			syncInterval: z.number().optional().describe('Sync interval in milliseconds (default: 300000)'),
			enableBidirectionalSync: z.boolean().optional().describe('Enable bidirectional sync (default: true)'),
			enableWebhooks: z.boolean().optional().describe('Enable webhook server (default: true)'),
			webhookPort: z.number().optional().describe('Webhook server port (default: 3000)'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info('Initializing Linear integration...');

				const config = {
					apiKey: args.apiKey,
					teamId: args.teamId,
					projectId: args.projectId,
					enableAutoSync: args.enableAutoSync,
					syncInterval: args.syncInterval,
					enableBidirectionalSync: args.enableBidirectionalSync,
					enableWebhooks: args.enableWebhooks,
					webhookPort: args.webhookPort
				};

				const integration = await ensureLinearIntegration(config);
				const summary = integration.getConfigSummary();

				return handleApiResult({
					success: true,
					message: 'Linear integration initialized successfully',
					config: summary
				}, log);
			} catch (error) {
				log.error(`Error initializing Linear integration: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Test Linear connection
	server.addTool({
		name: 'linear_test_connection',
		description: 'Test Linear API connection and authentication',
		parameters: z.object({
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info('Testing Linear connection...');

				const integration = await ensureLinearIntegration();
				const result = await integration.testConnection();

				return handleApiResult(result, log);
			} catch (error) {
				log.error(`Error testing Linear connection: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Sync single task to Linear
	server.addTool({
		name: 'linear_sync_task',
		description: 'Sync a specific task to Linear',
		parameters: z.object({
			taskId: z.number().describe('Task ID to sync'),
			prUrl: z.string().optional().describe('Related PR URL (if any)'),
			statusChanged: z.boolean().optional().describe('Whether task status changed'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info(`Syncing task ${args.taskId} to Linear...`);

				const integration = await ensureLinearIntegration();
				
				// Load the task
				const tasks = await integration.syncEngine.loadTasks();
				const task = tasks.find(t => t.id === args.taskId);
				
				if (!task) {
					return createErrorResponse(`Task ${args.taskId} not found`);
				}

				const context = {
					prUrl: args.prUrl,
					statusChanged: args.statusChanged
				};

				await integration.syncTask(task, context);

				const issueUrl = integration.getLinearIssueUrl(args.taskId);

				return handleApiResult({
					success: true,
					message: `Task ${args.taskId} synced to Linear successfully`,
					taskId: args.taskId,
					linearIssueUrl: issueUrl
				}, log);
			} catch (error) {
				log.error(`Error syncing task to Linear: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Sync all tasks to Linear
	server.addTool({
		name: 'linear_sync_all_tasks',
		description: 'Sync all tasks to Linear',
		parameters: z.object({
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info('Syncing all tasks to Linear...');

				const integration = await ensureLinearIntegration();
				await integration.syncAllTasks();

				const stats = integration.getSyncStats();

				return handleApiResult({
					success: true,
					message: 'All tasks synced to Linear successfully',
					syncStats: stats
				}, log);
			} catch (error) {
				log.error(`Error syncing all tasks to Linear: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Handle task creation event
	server.addTool({
		name: 'linear_on_task_created',
		description: 'Handle task creation event for Linear sync',
		parameters: z.object({
			taskId: z.number().describe('Created task ID'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info(`Handling task creation event for task ${args.taskId}...`);

				const integration = await ensureLinearIntegration();
				
				// Load the task
				const tasks = await integration.syncEngine.loadTasks();
				const task = tasks.find(t => t.id === args.taskId);
				
				if (!task) {
					return createErrorResponse(`Task ${args.taskId} not found`);
				}

				await integration.onTaskCreated(task);

				const issueUrl = integration.getLinearIssueUrl(args.taskId);

				return handleApiResult({
					success: true,
					message: `Task creation event handled for task ${args.taskId}`,
					taskId: args.taskId,
					linearIssueUrl: issueUrl
				}, log);
			} catch (error) {
				log.error(`Error handling task creation event: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Handle PR creation event
	server.addTool({
		name: 'linear_on_pr_created',
		description: 'Handle PR creation event for Linear sync',
		parameters: z.object({
			taskId: z.number().describe('Related task ID'),
			prUrl: z.string().describe('PR URL'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info(`Handling PR creation event for task ${args.taskId}...`);

				const integration = await ensureLinearIntegration();
				
				// Load the task
				const tasks = await integration.syncEngine.loadTasks();
				const task = tasks.find(t => t.id === args.taskId);
				
				if (!task) {
					return createErrorResponse(`Task ${args.taskId} not found`);
				}

				await integration.onPRCreated(task, args.prUrl);

				const issueUrl = integration.getLinearIssueUrl(args.taskId);

				return handleApiResult({
					success: true,
					message: `PR creation event handled for task ${args.taskId}`,
					taskId: args.taskId,
					prUrl: args.prUrl,
					linearIssueUrl: issueUrl
				}, log);
			} catch (error) {
				log.error(`Error handling PR creation event: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Handle PR merge event
	server.addTool({
		name: 'linear_on_pr_merged',
		description: 'Handle PR merge event for Linear sync',
		parameters: z.object({
			taskId: z.number().describe('Related task ID'),
			prUrl: z.string().describe('PR URL'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info(`Handling PR merge event for task ${args.taskId}...`);

				const integration = await ensureLinearIntegration();
				
				// Load the task
				const tasks = await integration.syncEngine.loadTasks();
				const task = tasks.find(t => t.id === args.taskId);
				
				if (!task) {
					return createErrorResponse(`Task ${args.taskId} not found`);
				}

				await integration.onPRMerged(task, args.prUrl);

				const issueUrl = integration.getLinearIssueUrl(args.taskId);

				return handleApiResult({
					success: true,
					message: `PR merge event handled for task ${args.taskId}`,
					taskId: args.taskId,
					prUrl: args.prUrl,
					linearIssueUrl: issueUrl
				}, log);
			} catch (error) {
				log.error(`Error handling PR merge event: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Handle error event
	server.addTool({
		name: 'linear_on_error',
		description: 'Handle error event for Linear sync',
		parameters: z.object({
			taskId: z.number().describe('Related task ID'),
			errorMessage: z.string().describe('Error message'),
			context: z.string().optional().describe('Additional context (JSON string)'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info(`Handling error event for task ${args.taskId}...`);

				const integration = await ensureLinearIntegration();
				
				// Load the task
				const tasks = await integration.syncEngine.loadTasks();
				const task = tasks.find(t => t.id === args.taskId);
				
				if (!task) {
					return createErrorResponse(`Task ${args.taskId} not found`);
				}

				const error = new Error(args.errorMessage);
				const context = args.context ? JSON.parse(args.context) : {};

				await integration.onError(task, error, context);

				const issueUrl = integration.getLinearIssueUrl(args.taskId);

				return handleApiResult({
					success: true,
					message: `Error event handled for task ${args.taskId}`,
					taskId: args.taskId,
					errorMessage: args.errorMessage,
					linearIssueUrl: issueUrl
				}, log);
			} catch (error) {
				log.error(`Error handling error event: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Get sync statistics
	server.addTool({
		name: 'linear_get_sync_stats',
		description: 'Get Linear synchronization statistics',
		parameters: z.object({
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info('Getting Linear sync statistics...');

				const integration = await ensureLinearIntegration();
				const stats = integration.getSyncStats();
				const rateLimitStatus = integration.getRateLimitStatus();

				return handleApiResult({
					success: true,
					syncStats: stats,
					rateLimitStatus: rateLimitStatus
				}, log);
			} catch (error) {
				log.error(`Error getting sync statistics: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Get Linear issue URL for task
	server.addTool({
		name: 'linear_get_issue_url',
		description: 'Get Linear issue URL for a task',
		parameters: z.object({
			taskId: z.number().describe('Task ID'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info(`Getting Linear issue URL for task ${args.taskId}...`);

				const integration = await ensureLinearIntegration();
				const issueUrl = integration.getLinearIssueUrl(args.taskId);

				return handleApiResult({
					success: true,
					taskId: args.taskId,
					linearIssueUrl: issueUrl
				}, log);
			} catch (error) {
				log.error(`Error getting Linear issue URL: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Update Linear configuration
	server.addTool({
		name: 'linear_update_config',
		description: 'Update Linear integration configuration',
		parameters: z.object({
			apiKey: z.string().optional().describe('Linear API key'),
			teamId: z.string().optional().describe('Linear team ID'),
			projectId: z.string().optional().describe('Linear project ID'),
			enableAutoSync: z.boolean().optional().describe('Enable automatic synchronization'),
			syncInterval: z.number().optional().describe('Sync interval in milliseconds'),
			enableBidirectionalSync: z.boolean().optional().describe('Enable bidirectional sync'),
			statusMapping: z.string().optional().describe('Status mapping configuration (JSON string)'),
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info('Updating Linear configuration...');

				const integration = await ensureLinearIntegration();
				
				const newConfig = {
					apiKey: args.apiKey,
					teamId: args.teamId,
					projectId: args.projectId,
					enableAutoSync: args.enableAutoSync,
					syncInterval: args.syncInterval,
					enableBidirectionalSync: args.enableBidirectionalSync
				};

				if (args.statusMapping) {
					newConfig.statusMapping = JSON.parse(args.statusMapping);
				}

				// Remove undefined values
				Object.keys(newConfig).forEach(key => {
					if (newConfig[key] === undefined) {
						delete newConfig[key];
					}
				});

				integration.updateConfig(newConfig);
				const summary = integration.getConfigSummary();

				return handleApiResult({
					success: true,
					message: 'Linear configuration updated successfully',
					config: summary
				}, log);
			} catch (error) {
				log.error(`Error updating Linear configuration: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});

	// Stop Linear integration
	server.addTool({
		name: 'linear_stop',
		description: 'Stop Linear integration and cleanup resources',
		parameters: z.object({
			projectRoot: z.string().describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				log.info('Stopping Linear integration...');

				if (linearIntegration) {
					await linearIntegration.stop();
					linearIntegration = null;
				}

				return handleApiResult({
					success: true,
					message: 'Linear integration stopped successfully'
				}, log);
			} catch (error) {
				log.error(`Error stopping Linear integration: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});
}

export default registerLinearIntegrationTools;

