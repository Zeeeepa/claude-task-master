/**
 * integrations/linear/webhook-handlers.js
 * Webhook handlers for GitHub events and Linear webhook processing
 */

import crypto from 'crypto';
import { LinearSyncEngine } from '../../sync/linear-sync.js';

/**
 * GitHub webhook handler for Linear integration
 */
export class GitHubWebhookHandler {
	constructor(syncEngine, config = {}) {
		this.syncEngine = syncEngine;
		this.config = {
			secret: config.secret || process.env.GITHUB_WEBHOOK_SECRET,
			enablePREvents: config.enablePREvents !== false,
			enablePushEvents: config.enablePushEvents !== false,
			enableIssueEvents: config.enableIssueEvents !== false,
			...config
		};
	}

	/**
	 * Verify GitHub webhook signature
	 * @param {string} payload - Raw payload
	 * @param {string} signature - GitHub signature header
	 * @returns {boolean} Whether signature is valid
	 */
	verifySignature(payload, signature) {
		if (!this.config.secret) {
			console.warn('GitHub webhook secret not configured, skipping signature verification');
			return true;
		}

		const expectedSignature = crypto
			.createHmac('sha256', this.config.secret)
			.update(payload, 'utf8')
			.digest('hex');

		const actualSignature = signature.replace('sha256=', '');
		
		return crypto.timingSafeEqual(
			Buffer.from(expectedSignature, 'hex'),
			Buffer.from(actualSignature, 'hex')
		);
	}

	/**
	 * Handle GitHub webhook event
	 * @param {Object} event - GitHub webhook event
	 * @param {string} eventType - Event type from X-GitHub-Event header
	 * @returns {Promise<Object>} Processing result
	 */
	async handleEvent(event, eventType) {
		try {
			console.log(`Processing GitHub ${eventType} event`);

			switch (eventType) {
				case 'pull_request':
					return await this.handlePullRequestEvent(event);
				case 'push':
					return await this.handlePushEvent(event);
				case 'issues':
					return await this.handleIssuesEvent(event);
				case 'workflow_run':
					return await this.handleWorkflowRunEvent(event);
				case 'check_run':
					return await this.handleCheckRunEvent(event);
				default:
					console.log(`Unhandled GitHub event type: ${eventType}`);
					return { status: 'ignored', reason: 'Unhandled event type' };
			}
		} catch (error) {
			console.error(`Error handling GitHub ${eventType} event:`, error.message);
			return { status: 'error', error: error.message };
		}
	}

	/**
	 * Handle pull request events
	 * @param {Object} event - PR event data
	 * @returns {Promise<Object>} Processing result
	 */
	async handlePullRequestEvent(event) {
		if (!this.config.enablePREvents) {
			return { status: 'ignored', reason: 'PR events disabled' };
		}

		const { action, pull_request } = event;
		const prUrl = pull_request.html_url;
		const branchName = pull_request.head.ref;
		
		// Extract task ID from branch name or PR title
		const taskId = this.extractTaskId(branchName, pull_request.title);
		
		if (!taskId) {
			console.log('No task ID found in PR, skipping Linear sync');
			return { status: 'ignored', reason: 'No task ID found' };
		}

		// Load task data
		const task = await this.loadTask(taskId);
		if (!task) {
			console.log(`Task ${taskId} not found, skipping Linear sync`);
			return { status: 'ignored', reason: 'Task not found' };
		}

		switch (action) {
			case 'opened':
				await this.syncEngine.onPRCreated(task, prUrl);
				return { status: 'success', action: 'pr_created', taskId, prUrl };

			case 'closed':
				if (pull_request.merged) {
					await this.syncEngine.onPRMerged(task, prUrl);
					return { status: 'success', action: 'pr_merged', taskId, prUrl };
				} else {
					// PR was closed without merging
					const context = { prUrl, prClosed: true };
					await this.syncEngine.onTaskUpdated(task, task, context);
					return { status: 'success', action: 'pr_closed', taskId, prUrl };
				}

			case 'reopened':
				const context = { prUrl, prReopened: true };
				await this.syncEngine.onTaskUpdated(task, task, context);
				return { status: 'success', action: 'pr_reopened', taskId, prUrl };

			case 'ready_for_review':
				const reviewContext = { prUrl, readyForReview: true };
				await this.syncEngine.onTaskUpdated(task, task, reviewContext);
				return { status: 'success', action: 'pr_ready_for_review', taskId, prUrl };

			default:
				console.log(`Unhandled PR action: ${action}`);
				return { status: 'ignored', reason: `Unhandled PR action: ${action}` };
		}
	}

	/**
	 * Handle workflow run events
	 * @param {Object} event - Workflow run event data
	 * @returns {Promise<Object>} Processing result
	 */
	async handleWorkflowRunEvent(event) {
		const { action, workflow_run } = event;
		
		if (action !== 'completed') {
			return { status: 'ignored', reason: 'Only completed workflow runs are processed' };
		}

		const branchName = workflow_run.head_branch;
		const taskId = this.extractTaskId(branchName);
		
		if (!taskId) {
			return { status: 'ignored', reason: 'No task ID found' };
		}

		const task = await this.loadTask(taskId);
		if (!task) {
			return { status: 'ignored', reason: 'Task not found' };
		}

		const context = {
			workflowRun: true,
			workflowName: workflow_run.name,
			workflowConclusion: workflow_run.conclusion,
			workflowUrl: workflow_run.html_url
		};

		if (workflow_run.conclusion === 'success') {
			context.validationPassed = true;
		} else if (workflow_run.conclusion === 'failure') {
			context.validationFailed = true;
			context.errorMessage = `Workflow ${workflow_run.name} failed`;
		}

		await this.syncEngine.onTaskUpdated(task, task, context);
		
		return { 
			status: 'success', 
			action: 'workflow_completed', 
			taskId, 
			conclusion: workflow_run.conclusion 
		};
	}

	/**
	 * Handle check run events
	 * @param {Object} event - Check run event data
	 * @returns {Promise<Object>} Processing result
	 */
	async handleCheckRunEvent(event) {
		const { action, check_run } = event;
		
		if (action !== 'completed') {
			return { status: 'ignored', reason: 'Only completed check runs are processed' };
		}

		// Get PR information from check run
		const pullRequests = check_run.pull_requests || [];
		if (pullRequests.length === 0) {
			return { status: 'ignored', reason: 'No associated pull requests' };
		}

		const pr = pullRequests[0];
		const taskId = this.extractTaskId(pr.head.ref, pr.title);
		
		if (!taskId) {
			return { status: 'ignored', reason: 'No task ID found' };
		}

		const task = await this.loadTask(taskId);
		if (!task) {
			return { status: 'ignored', reason: 'Task not found' };
		}

		const context = {
			checkRun: true,
			checkName: check_run.name,
			checkConclusion: check_run.conclusion,
			checkUrl: check_run.html_url,
			prUrl: pr.html_url
		};

		if (check_run.conclusion === 'success') {
			context.validationPassed = true;
		} else if (check_run.conclusion === 'failure') {
			context.validationFailed = true;
			context.errorMessage = `Check ${check_run.name} failed`;
		}

		await this.syncEngine.onTaskUpdated(task, task, context);
		
		return { 
			status: 'success', 
			action: 'check_completed', 
			taskId, 
			conclusion: check_run.conclusion 
		};
	}

	/**
	 * Handle push events
	 * @param {Object} event - Push event data
	 * @returns {Promise<Object>} Processing result
	 */
	async handlePushEvent(event) {
		if (!this.config.enablePushEvents) {
			return { status: 'ignored', reason: 'Push events disabled' };
		}

		const branchName = event.ref.replace('refs/heads/', '');
		const taskId = this.extractTaskId(branchName);
		
		if (!taskId) {
			return { status: 'ignored', reason: 'No task ID found' };
		}

		const task = await this.loadTask(taskId);
		if (!task) {
			return { status: 'ignored', reason: 'Task not found' };
		}

		const context = {
			push: true,
			branchName,
			commits: event.commits?.length || 0,
			commitUrl: event.head_commit?.url
		};

		await this.syncEngine.onTaskUpdated(task, task, context);
		
		return { status: 'success', action: 'push_processed', taskId, branchName };
	}

	/**
	 * Handle GitHub issues events
	 * @param {Object} event - Issues event data
	 * @returns {Promise<Object>} Processing result
	 */
	async handleIssuesEvent(event) {
		if (!this.config.enableIssueEvents) {
			return { status: 'ignored', reason: 'Issue events disabled' };
		}

		// This could be used for bidirectional sync if GitHub issues are used
		// alongside Linear issues
		console.log('GitHub issues event received, but not implemented yet');
		return { status: 'ignored', reason: 'GitHub issues sync not implemented' };
	}

	/**
	 * Extract task ID from branch name or PR title
	 * @param {string} branchName - Git branch name
	 * @param {string} prTitle - PR title (optional)
	 * @returns {number|null} Task ID or null if not found
	 */
	extractTaskId(branchName, prTitle = '') {
		// Try to extract from branch name first
		// Patterns: task-123, task/123, feature/task-123, etc.
		const branchPatterns = [
			/task[-_](\d+)/i,
			/task\/(\d+)/i,
			/(\d+)[-_]task/i,
			/task(\d+)/i,
			/id[-_](\d+)/i
		];

		for (const pattern of branchPatterns) {
			const match = branchName.match(pattern);
			if (match) {
				return parseInt(match[1]);
			}
		}

		// Try to extract from PR title
		if (prTitle) {
			const titlePatterns = [
				/task\s*#?(\d+)/i,
				/\[task\s*(\d+)\]/i,
				/\(task\s*(\d+)\)/i,
				/#(\d+)/
			];

			for (const pattern of titlePatterns) {
				const match = prTitle.match(pattern);
				if (match) {
					return parseInt(match[1]);
				}
			}
		}

		return null;
	}

	/**
	 * Load task by ID
	 * @param {number} taskId - Task ID
	 * @returns {Promise<Object|null>} Task object or null
	 */
	async loadTask(taskId) {
		try {
			const tasks = await this.syncEngine.loadTasks();
			return tasks.find(task => task.id === taskId) || null;
		} catch (error) {
			console.error(`Failed to load task ${taskId}:`, error.message);
			return null;
		}
	}
}

/**
 * Linear webhook handler for processing Linear events
 */
export class LinearWebhookHandler {
	constructor(syncEngine, config = {}) {
		this.syncEngine = syncEngine;
		this.config = {
			secret: config.secret || process.env.LINEAR_WEBHOOK_SECRET,
			enableIssueEvents: config.enableIssueEvents !== false,
			enableCommentEvents: config.enableCommentEvents !== false,
			...config
		};
	}

	/**
	 * Verify Linear webhook signature
	 * @param {string} payload - Raw payload
	 * @param {string} signature - Linear signature header
	 * @returns {boolean} Whether signature is valid
	 */
	verifySignature(payload, signature) {
		if (!this.config.secret) {
			console.warn('Linear webhook secret not configured, skipping signature verification');
			return true;
		}

		const expectedSignature = crypto
			.createHmac('sha256', this.config.secret)
			.update(payload, 'utf8')
			.digest('hex');

		return crypto.timingSafeEqual(
			Buffer.from(expectedSignature, 'hex'),
			Buffer.from(signature, 'hex')
		);
	}

	/**
	 * Handle Linear webhook event
	 * @param {Object} event - Linear webhook event
	 * @returns {Promise<Object>} Processing result
	 */
	async handleEvent(event) {
		try {
			console.log(`Processing Linear ${event.type} event`);

			switch (event.type) {
				case 'Issue':
					return await this.handleIssueEvent(event);
				case 'Comment':
					return await this.handleCommentEvent(event);
				default:
					console.log(`Unhandled Linear event type: ${event.type}`);
					return { status: 'ignored', reason: 'Unhandled event type' };
			}
		} catch (error) {
			console.error(`Error handling Linear ${event.type} event:`, error.message);
			return { status: 'error', error: error.message };
		}
	}

	/**
	 * Handle Linear issue events
	 * @param {Object} event - Issue event data
	 * @returns {Promise<Object>} Processing result
	 */
	async handleIssueEvent(event) {
		if (!this.config.enableIssueEvents) {
			return { status: 'ignored', reason: 'Issue events disabled' };
		}

		const { action, data } = event;
		const issue = data;

		// Find corresponding task
		const taskId = this.extractTaskIdFromIssue(issue);
		if (!taskId) {
			return { status: 'ignored', reason: 'No task ID found in issue' };
		}

		const task = await this.loadTask(taskId);
		if (!task) {
			return { status: 'ignored', reason: 'Task not found' };
		}

		switch (action) {
			case 'update':
				await this.handleIssueUpdate(issue, task);
				return { status: 'success', action: 'issue_updated', taskId };

			case 'remove':
				await this.handleIssueRemoval(issue, task);
				return { status: 'success', action: 'issue_removed', taskId };

			default:
				console.log(`Unhandled Linear issue action: ${action}`);
				return { status: 'ignored', reason: `Unhandled issue action: ${action}` };
		}
	}

	/**
	 * Handle Linear comment events
	 * @param {Object} event - Comment event data
	 * @returns {Promise<Object>} Processing result
	 */
	async handleCommentEvent(event) {
		if (!this.config.enableCommentEvents) {
			return { status: 'ignored', reason: 'Comment events disabled' };
		}

		const { action, data } = event;
		const comment = data;

		// Get issue information
		const issueId = comment.issueId;
		if (!issueId) {
			return { status: 'ignored', reason: 'No issue ID in comment' };
		}

		// Find corresponding task
		const taskId = this.findTaskByLinearIssueId(issueId);
		if (!taskId) {
			return { status: 'ignored', reason: 'No task found for Linear issue' };
		}

		const task = await this.loadTask(taskId);
		if (!task) {
			return { status: 'ignored', reason: 'Task not found' };
		}

		switch (action) {
			case 'create':
				await this.handleCommentCreation(comment, task);
				return { status: 'success', action: 'comment_created', taskId };

			default:
				console.log(`Unhandled Linear comment action: ${action}`);
				return { status: 'ignored', reason: `Unhandled comment action: ${action}` };
		}
	}

	/**
	 * Handle Linear issue update
	 * @param {Object} issue - Linear issue data
	 * @param {Object} task - Task object
	 */
	async handleIssueUpdate(issue, task) {
		// Update task based on Linear issue changes
		const previousTask = { ...task };
		
		// Update status
		const newStatus = this.syncEngine.statusMapper.mapFromLinearState(issue.state.name);
		if (task.status !== newStatus) {
			task.status = newStatus;
		}

		// Update priority
		const newPriority = this.syncEngine.statusMapper.mapFromLinearPriority(issue.priority);
		if (task.priority !== newPriority) {
			task.priority = newPriority;
		}

		// Update assignee
		if (issue.assignee && issue.assignee.email) {
			task.assignee = issue.assignee.email;
		}

		// Save updated task
		await this.syncEngine.saveTasks([task]);
		
		console.log(`Updated task ${task.id} from Linear issue ${issue.identifier}`);
	}

	/**
	 * Handle Linear issue removal
	 * @param {Object} issue - Linear issue data
	 * @param {Object} task - Task object
	 */
	async handleIssueRemoval(issue, task) {
		// Remove Linear metadata from task
		if (task.linearMetadata) {
			delete task.linearMetadata;
		}

		// Remove from sync metadata
		const taskKey = `task_${task.id}`;
		this.syncEngine.syncMetadata.delete(taskKey);

		await this.syncEngine.saveTasks([task]);
		await this.syncEngine.saveSyncMetadata();
		
		console.log(`Removed Linear metadata from task ${task.id}`);
	}

	/**
	 * Handle Linear comment creation
	 * @param {Object} comment - Linear comment data
	 * @param {Object} task - Task object
	 */
	async handleCommentCreation(comment, task) {
		// Check if comment contains task instructions or updates
		const commentBody = comment.body.toLowerCase();
		
		// Look for status change commands
		const statusCommands = {
			'mark as done': 'done',
			'mark as complete': 'done',
			'mark as in progress': 'in-progress',
			'mark as pending': 'pending',
			'mark as blocked': 'blocked'
		};

		for (const [command, status] of Object.entries(statusCommands)) {
			if (commentBody.includes(command)) {
				const previousTask = { ...task };
				task.status = status;
				
				await this.syncEngine.saveTasks([task]);
				console.log(`Updated task ${task.id} status to ${status} from Linear comment`);
				break;
			}
		}
	}

	/**
	 * Extract task ID from Linear issue
	 * @param {Object} issue - Linear issue data
	 * @returns {number|null} Task ID or null
	 */
	extractTaskIdFromIssue(issue) {
		// Check external ID first
		if (issue.externalId) {
			const match = issue.externalId.match(/task[_-](\d+)/i);
			if (match) {
				return parseInt(match[1]);
			}
		}

		// Check description for task ID
		if (issue.description) {
			const match = issue.description.match(/Task ID:\s*(\d+)/i);
			if (match) {
				return parseInt(match[1]);
			}
		}

		// Check title for task ID
		if (issue.title) {
			const match = issue.title.match(/task\s*#?(\d+)/i);
			if (match) {
				return parseInt(match[1]);
			}
		}

		return null;
	}

	/**
	 * Find task by Linear issue ID
	 * @param {string} issueId - Linear issue ID
	 * @returns {number|null} Task ID or null
	 */
	findTaskByLinearIssueId(issueId) {
		for (const [taskKey, storedIssueId] of this.syncEngine.syncMetadata) {
			if (storedIssueId === issueId && taskKey.startsWith('task_')) {
				return parseInt(taskKey.replace('task_', ''));
			}
		}
		return null;
	}

	/**
	 * Load task by ID
	 * @param {number} taskId - Task ID
	 * @returns {Promise<Object|null>} Task object or null
	 */
	async loadTask(taskId) {
		try {
			const tasks = await this.syncEngine.loadTasks();
			return tasks.find(task => task.id === taskId) || null;
		} catch (error) {
			console.error(`Failed to load task ${taskId}:`, error.message);
			return null;
		}
	}
}

/**
 * Webhook server for handling GitHub and Linear webhooks
 */
export class WebhookServer {
	constructor(syncEngine, config = {}) {
		this.syncEngine = syncEngine;
		this.config = {
			port: config.port || process.env.WEBHOOK_PORT || 3000,
			path: config.path || '/webhooks',
			enableGitHub: config.enableGitHub !== false,
			enableLinear: config.enableLinear !== false,
			...config
		};

		this.githubHandler = new GitHubWebhookHandler(syncEngine, config.github);
		this.linearHandler = new LinearWebhookHandler(syncEngine, config.linear);
	}

	/**
	 * Start the webhook server
	 */
	async start() {
		const express = await import('express');
		const app = express.default();

		// Middleware for parsing raw body
		app.use(express.raw({ type: 'application/json' }));

		// GitHub webhook endpoint
		if (this.config.enableGitHub) {
			app.post(`${this.config.path}/github`, async (req, res) => {
				try {
					const signature = req.headers['x-hub-signature-256'];
					const eventType = req.headers['x-github-event'];
					const payload = req.body.toString();

					if (!this.githubHandler.verifySignature(payload, signature)) {
						return res.status(401).json({ error: 'Invalid signature' });
					}

					const event = JSON.parse(payload);
					const result = await this.githubHandler.handleEvent(event, eventType);
					
					res.json(result);
				} catch (error) {
					console.error('GitHub webhook error:', error.message);
					res.status(500).json({ error: 'Internal server error' });
				}
			});
		}

		// Linear webhook endpoint
		if (this.config.enableLinear) {
			app.post(`${this.config.path}/linear`, async (req, res) => {
				try {
					const signature = req.headers['linear-signature'];
					const payload = req.body.toString();

					if (!this.linearHandler.verifySignature(payload, signature)) {
						return res.status(401).json({ error: 'Invalid signature' });
					}

					const event = JSON.parse(payload);
					const result = await this.linearHandler.handleEvent(event);
					
					res.json(result);
				} catch (error) {
					console.error('Linear webhook error:', error.message);
					res.status(500).json({ error: 'Internal server error' });
				}
			});
		}

		// Health check endpoint
		app.get(`${this.config.path}/health`, (req, res) => {
			res.json({
				status: 'healthy',
				timestamp: new Date().toISOString(),
				syncStats: this.syncEngine.getSyncStats()
			});
		});

		// Start server
		const server = app.listen(this.config.port, () => {
			console.log(`Webhook server listening on port ${this.config.port}`);
			console.log(`GitHub webhooks: ${this.config.path}/github`);
			console.log(`Linear webhooks: ${this.config.path}/linear`);
			console.log(`Health check: ${this.config.path}/health`);
		});

		return server;
	}
}

export default { GitHubWebhookHandler, LinearWebhookHandler, WebhookServer };

