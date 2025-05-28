/**
 * integrations/linear/index.js
 * Main Linear integration module
 */

import { LinearClient } from '../../utils/linear-client.js';
import { StatusMapper } from './status-mapping.js';
import { LinearSyncEngine } from '../../sync/linear-sync.js';
import { WebhookServer, GitHubWebhookHandler, LinearWebhookHandler } from './webhook-handlers.js';

/**
 * Linear integration manager
 */
export class LinearIntegration {
	constructor(config = {}) {
		this.config = {
			// API Configuration
			apiKey: config.apiKey || process.env.LINEAR_API_KEY,
			teamId: config.teamId || process.env.LINEAR_TEAM_ID,
			projectId: config.projectId || process.env.LINEAR_PROJECT_ID,
			
			// Sync Configuration
			enableAutoSync: config.enableAutoSync !== false,
			syncInterval: config.syncInterval || 300000, // 5 minutes
			enableBidirectionalSync: config.enableBidirectionalSync !== false,
			enableAutoCreate: config.enableAutoCreate !== false,
			enableAutoUpdate: config.enableAutoUpdate !== false,
			enableAutoClose: config.enableAutoClose !== false,
			
			// Webhook Configuration
			enableWebhooks: config.enableWebhooks !== false,
			webhookPort: config.webhookPort || process.env.WEBHOOK_PORT || 3000,
			webhookPath: config.webhookPath || '/webhooks',
			githubWebhookSecret: config.githubWebhookSecret || process.env.GITHUB_WEBHOOK_SECRET,
			linearWebhookSecret: config.linearWebhookSecret || process.env.LINEAR_WEBHOOK_SECRET,
			
			// Rate Limiting
			rateLimitThreshold: config.rateLimitThreshold || 0.8,
			retryAttempts: config.retryAttempts || 3,
			
			// Custom Mappings
			statusMapping: config.statusMapping || {},
			
			...config
		};

		this.client = null;
		this.syncEngine = null;
		this.webhookServer = null;
		this.isInitialized = false;
	}

	/**
	 * Initialize the Linear integration
	 */
	async initialize() {
		if (this.isInitialized) {
			console.log('Linear integration already initialized');
			return;
		}

		try {
			console.log('Initializing Linear integration...');

			// Validate configuration
			this.validateConfig();

			// Initialize Linear client
			this.client = new LinearClient(this.config.apiKey, {
				rateLimitThreshold: this.config.rateLimitThreshold,
				retryAttempts: this.config.retryAttempts
			});

			// Initialize sync engine
			this.syncEngine = new LinearSyncEngine(this.config);
			await this.syncEngine.initialize();

			// Initialize webhook server if enabled
			if (this.config.enableWebhooks) {
				await this.initializeWebhooks();
			}

			// Start auto sync if enabled
			if (this.config.enableAutoSync) {
				this.syncEngine.startAutoSync();
			}

			this.isInitialized = true;
			console.log('Linear integration initialized successfully');

		} catch (error) {
			console.error('Failed to initialize Linear integration:', error.message);
			throw error;
		}
	}

	/**
	 * Validate configuration
	 */
	validateConfig() {
		if (!this.config.apiKey) {
			throw new Error('Linear API key is required. Set LINEAR_API_KEY environment variable or pass apiKey in config.');
		}

		if (this.config.enableWebhooks) {
			if (!this.config.githubWebhookSecret) {
				console.warn('GitHub webhook secret not configured. Webhook signature verification will be skipped.');
			}
			if (!this.config.linearWebhookSecret) {
				console.warn('Linear webhook secret not configured. Webhook signature verification will be skipped.');
			}
		}
	}

	/**
	 * Initialize webhook server
	 */
	async initializeWebhooks() {
		this.webhookServer = new WebhookServer(this.syncEngine, {
			port: this.config.webhookPort,
			path: this.config.webhookPath,
			github: {
				secret: this.config.githubWebhookSecret
			},
			linear: {
				secret: this.config.linearWebhookSecret
			}
		});

		await this.webhookServer.start();
		console.log(`Webhook server started on port ${this.config.webhookPort}`);
	}

	/**
	 * Create a Linear issue from a task
	 * @param {Object} task - Task object
	 * @param {Object} context - Additional context
	 * @returns {Promise<Object>} Created Linear issue
	 */
	async createIssueFromTask(task, context = {}) {
		if (!this.isInitialized) {
			throw new Error('Linear integration not initialized');
		}

		return await this.syncEngine.createLinearIssue(task, context);
	}

	/**
	 * Update a Linear issue from a task
	 * @param {string} issueId - Linear issue ID
	 * @param {Object} task - Task object
	 * @param {Object} context - Additional context
	 * @returns {Promise<Object>} Updated Linear issue
	 */
	async updateIssueFromTask(issueId, task, context = {}) {
		if (!this.isInitialized) {
			throw new Error('Linear integration not initialized');
		}

		return await this.syncEngine.updateLinearIssue(issueId, task, context);
	}

	/**
	 * Sync a single task to Linear
	 * @param {Object} task - Task object
	 * @param {Object} context - Additional context
	 * @returns {Promise<void>}
	 */
	async syncTask(task, context = {}) {
		if (!this.isInitialized) {
			throw new Error('Linear integration not initialized');
		}

		await this.syncEngine.syncTaskToLinear(task, context);
	}

	/**
	 * Sync all tasks to Linear
	 * @returns {Promise<void>}
	 */
	async syncAllTasks() {
		if (!this.isInitialized) {
			throw new Error('Linear integration not initialized');
		}

		await this.syncEngine.performSync();
	}

	/**
	 * Handle task creation event
	 * @param {Object} task - Created task
	 * @returns {Promise<void>}
	 */
	async onTaskCreated(task) {
		if (!this.isInitialized) {
			return;
		}

		await this.syncEngine.onTaskCreated(task);
	}

	/**
	 * Handle task update event
	 * @param {Object} task - Updated task
	 * @param {Object} previousTask - Previous task state
	 * @returns {Promise<void>}
	 */
	async onTaskUpdated(task, previousTask) {
		if (!this.isInitialized) {
			return;
		}

		await this.syncEngine.onTaskUpdated(task, previousTask);
	}

	/**
	 * Handle PR creation event
	 * @param {Object} task - Related task
	 * @param {string} prUrl - PR URL
	 * @returns {Promise<void>}
	 */
	async onPRCreated(task, prUrl) {
		if (!this.isInitialized) {
			return;
		}

		await this.syncEngine.onPRCreated(task, prUrl);
	}

	/**
	 * Handle PR merge event
	 * @param {Object} task - Related task
	 * @param {string} prUrl - PR URL
	 * @returns {Promise<void>}
	 */
	async onPRMerged(task, prUrl) {
		if (!this.isInitialized) {
			return;
		}

		await this.syncEngine.onPRMerged(task, prUrl);
	}

	/**
	 * Handle error event
	 * @param {Object} task - Related task
	 * @param {Error} error - Error object
	 * @param {Object} context - Additional context
	 * @returns {Promise<void>}
	 */
	async onError(task, error, context = {}) {
		if (!this.isInitialized) {
			return;
		}

		await this.syncEngine.onError(task, error, context);
	}

	/**
	 * Get Linear issue URL for a task
	 * @param {number} taskId - Task ID
	 * @returns {string|null} Linear issue URL or null
	 */
	getLinearIssueUrl(taskId) {
		if (!this.isInitialized) {
			return null;
		}

		return this.syncEngine.getLinearIssueUrl(taskId);
	}

	/**
	 * Get sync statistics
	 * @returns {Object} Sync statistics
	 */
	getSyncStats() {
		if (!this.isInitialized) {
			return null;
		}

		return this.syncEngine.getSyncStats();
	}

	/**
	 * Get rate limit status
	 * @returns {Object} Rate limit information
	 */
	getRateLimitStatus() {
		if (!this.isInitialized) {
			return null;
		}

		return this.client.getRateLimitStatus();
	}

	/**
	 * Test Linear API connection
	 * @returns {Promise<Object>} Connection test result
	 */
	async testConnection() {
		try {
			if (!this.client) {
				this.client = new LinearClient(this.config.apiKey);
			}

			// Try to get team information
			if (this.config.teamId) {
				const team = await this.client.getTeam(this.config.teamId);
				return {
					success: true,
					team: {
						id: team.id,
						name: team.name,
						key: team.key
					},
					rateLimitStatus: this.client.getRateLimitStatus()
				};
			} else {
				// Just test the API with a simple query
				const result = await this.client.makeRequest(`
					query {
						viewer {
							id
							name
							email
						}
					}
				`);

				return {
					success: true,
					viewer: result.viewer,
					rateLimitStatus: this.client.getRateLimitStatus()
				};
			}
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * Update configuration
	 * @param {Object} newConfig - New configuration options
	 */
	updateConfig(newConfig) {
		this.config = { ...this.config, ...newConfig };

		// Update sync engine configuration if initialized
		if (this.syncEngine) {
			this.syncEngine.config = { ...this.syncEngine.config, ...newConfig };
			
			// Update status mapping if provided
			if (newConfig.statusMapping) {
				this.syncEngine.statusMapper.updateMapping(newConfig.statusMapping);
			}
		}
	}

	/**
	 * Stop the Linear integration
	 */
	async stop() {
		if (!this.isInitialized) {
			return;
		}

		console.log('Stopping Linear integration...');

		// Stop sync engine
		if (this.syncEngine) {
			await this.syncEngine.cleanup();
		}

		// Stop webhook server
		if (this.webhookServer) {
			// Note: Express server doesn't have a built-in stop method
			// In a real implementation, you'd store the server instance and call server.close()
			console.log('Webhook server stopped');
		}

		this.isInitialized = false;
		console.log('Linear integration stopped');
	}

	/**
	 * Get configuration summary
	 * @returns {Object} Configuration summary
	 */
	getConfigSummary() {
		return {
			apiKeyConfigured: Boolean(this.config.apiKey),
			teamId: this.config.teamId,
			projectId: this.config.projectId,
			enableAutoSync: this.config.enableAutoSync,
			enableBidirectionalSync: this.config.enableBidirectionalSync,
			enableWebhooks: this.config.enableWebhooks,
			syncInterval: this.config.syncInterval,
			webhookPort: this.config.webhookPort,
			isInitialized: this.isInitialized
		};
	}
}

// Export individual components for advanced usage
export {
	LinearClient,
	StatusMapper,
	LinearSyncEngine,
	WebhookServer,
	GitHubWebhookHandler,
	LinearWebhookHandler
};

// Default export
export default LinearIntegration;

