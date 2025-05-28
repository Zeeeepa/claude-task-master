/**
 * sync/linear-sync.js
 * Bidirectional synchronization engine between Task Master and Linear
 */

import fs from 'fs/promises';
import path from 'path';
import { LinearClient } from '../utils/linear-client.js';
import { StatusMapper } from '../integrations/linear/status-mapping.js';

/**
 * Linear synchronization engine
 */
export class LinearSyncEngine {
	constructor(config = {}) {
		this.config = {
			apiKey: config.apiKey || process.env.LINEAR_API_KEY,
			teamId: config.teamId || process.env.LINEAR_TEAM_ID,
			projectId: config.projectId,
			syncInterval: config.syncInterval || 300000, // 5 minutes
			enableBidirectionalSync: config.enableBidirectionalSync !== false,
			enableAutoCreate: config.enableAutoCreate !== false,
			enableAutoUpdate: config.enableAutoUpdate !== false,
			enableAutoClose: config.enableAutoClose !== false,
			syncMetadataPath: config.syncMetadataPath || '.linear-sync-metadata.json',
			...config
		};

		if (!this.config.apiKey) {
			throw new Error('Linear API key is required. Set LINEAR_API_KEY environment variable or pass apiKey in config.');
		}

		this.linearClient = new LinearClient(this.config.apiKey, {
			rateLimitThreshold: config.rateLimitThreshold || 0.8,
			retryAttempts: config.retryAttempts || 3
		});

		this.statusMapper = new StatusMapper(config.statusMapping);
		this.syncMetadata = new Map();
		this.teamConfig = null;
		this.isRunning = false;
		this.syncInterval = null;
		this.lastSyncTime = null;
		this.syncStats = {
			totalSyncs: 0,
			successfulSyncs: 0,
			failedSyncs: 0,
			issuesCreated: 0,
			issuesUpdated: 0,
			issuesClosed: 0,
			lastError: null
		};
	}

	/**
	 * Initialize the sync engine
	 */
	async initialize() {
		try {
			// Load sync metadata
			await this.loadSyncMetadata();
			
			// Load team configuration
			await this.loadTeamConfig();
			
			console.log('Linear sync engine initialized successfully');
			return true;
		} catch (error) {
			console.error('Failed to initialize Linear sync engine:', error.message);
			throw error;
		}
	}

	/**
	 * Load team configuration from Linear
	 */
	async loadTeamConfig() {
		if (!this.config.teamId) {
			console.warn('No team ID configured. Some features may not work correctly.');
			return;
		}

		try {
			const team = await this.linearClient.getTeam(this.config.teamId);
			
			// Create state mapping
			const stateMapping = {};
			for (const state of team.states.nodes) {
				stateMapping[state.name] = state.id;
			}
			
			// Create label mapping
			const labelMapping = {};
			for (const label of team.labels.nodes) {
				labelMapping[label.name] = label.id;
			}
			
			// Create member mapping
			const memberMapping = {};
			for (const member of team.members.nodes) {
				memberMapping[member.email] = member.id;
				memberMapping[member.name] = member.id;
			}
			
			this.teamConfig = {
				teamId: team.id,
				teamName: team.name,
				teamKey: team.key,
				stateMapping,
				labelMapping,
				memberMapping,
				states: team.states.nodes,
				labels: team.labels.nodes,
				members: team.members.nodes
			};
			
			console.log(`Loaded configuration for team: ${team.name} (${team.key})`);
		} catch (error) {
			console.error('Failed to load team configuration:', error.message);
			throw error;
		}
	}

	/**
	 * Load sync metadata from file
	 */
	async loadSyncMetadata() {
		try {
			const metadataPath = path.resolve(this.config.syncMetadataPath);
			const data = await fs.readFile(metadataPath, 'utf8');
			const metadata = JSON.parse(data);
			
			this.syncMetadata = new Map(Object.entries(metadata.taskToIssue || {}));
			this.lastSyncTime = metadata.lastSyncTime ? new Date(metadata.lastSyncTime) : null;
			this.syncStats = { ...this.syncStats, ...metadata.syncStats };
			
			console.log(`Loaded sync metadata: ${this.syncMetadata.size} tracked issues`);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				console.warn('Failed to load sync metadata:', error.message);
			}
			// File doesn't exist or is invalid, start fresh
		}
	}

	/**
	 * Save sync metadata to file
	 */
	async saveSyncMetadata() {
		try {
			const metadata = {
				taskToIssue: Object.fromEntries(this.syncMetadata),
				lastSyncTime: new Date().toISOString(),
				syncStats: this.syncStats,
				version: '1.0.0'
			};
			
			const metadataPath = path.resolve(this.config.syncMetadataPath);
			await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
		} catch (error) {
			console.error('Failed to save sync metadata:', error.message);
		}
	}

	/**
	 * Start automatic synchronization
	 */
	startAutoSync() {
		if (this.isRunning) {
			console.log('Auto sync is already running');
			return;
		}

		this.isRunning = true;
		console.log(`Starting auto sync with ${this.config.syncInterval}ms interval`);
		
		// Run initial sync
		this.performSync().catch(error => {
			console.error('Initial sync failed:', error.message);
		});
		
		// Set up interval
		this.syncInterval = setInterval(() => {
			this.performSync().catch(error => {
				console.error('Scheduled sync failed:', error.message);
			});
		}, this.config.syncInterval);
	}

	/**
	 * Stop automatic synchronization
	 */
	stopAutoSync() {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
		
		console.log('Auto sync stopped');
	}

	/**
	 * Perform a complete synchronization cycle
	 */
	async performSync() {
		const startTime = Date.now();
		this.syncStats.totalSyncs++;
		
		try {
			console.log('Starting sync cycle...');
			
			// Load current tasks
			const tasks = await this.loadTasks();
			
			// Sync tasks to Linear
			await this.syncTasksToLinear(tasks);
			
			// Sync Linear issues back to tasks (if bidirectional sync is enabled)
			if (this.config.enableBidirectionalSync) {
				await this.syncLinearToTasks(tasks);
			}
			
			// Save metadata
			await this.saveSyncMetadata();
			
			this.syncStats.successfulSyncs++;
			this.lastSyncTime = new Date();
			
			const duration = Date.now() - startTime;
			console.log(`Sync cycle completed successfully in ${duration}ms`);
			
		} catch (error) {
			this.syncStats.failedSyncs++;
			this.syncStats.lastError = {
				message: error.message,
				timestamp: new Date().toISOString()
			};
			
			console.error('Sync cycle failed:', error.message);
			throw error;
		}
	}

	/**
	 * Load tasks from tasks.json
	 */
	async loadTasks() {
		try {
			const tasksPath = path.resolve('tasks/tasks.json');
			const data = await fs.readFile(tasksPath, 'utf8');
			const tasksData = JSON.parse(data);
			return tasksData.tasks || [];
		} catch (error) {
			console.error('Failed to load tasks:', error.message);
			return [];
		}
	}

	/**
	 * Save tasks to tasks.json
	 */
	async saveTasks(tasks) {
		try {
			const tasksPath = path.resolve('tasks/tasks.json');
			const tasksData = { tasks };
			await fs.writeFile(tasksPath, JSON.stringify(tasksData, null, 2));
		} catch (error) {
			console.error('Failed to save tasks:', error.message);
			throw error;
		}
	}

	/**
	 * Sync tasks to Linear issues
	 */
	async syncTasksToLinear(tasks) {
		for (const task of tasks) {
			try {
				await this.syncTaskToLinear(task);
			} catch (error) {
				console.error(`Failed to sync task ${task.id}:`, error.message);
			}
		}
	}

	/**
	 * Sync a single task to Linear
	 */
	async syncTaskToLinear(task, context = {}) {
		const taskKey = `task_${task.id}`;
		const existingIssueId = this.syncMetadata.get(taskKey);
		
		try {
			if (existingIssueId) {
				// Update existing issue
				await this.updateLinearIssue(existingIssueId, task, context);
			} else if (this.config.enableAutoCreate) {
				// Create new issue
				const issue = await this.createLinearIssue(task, context);
				this.syncMetadata.set(taskKey, issue.id);
				this.syncStats.issuesCreated++;
				
				console.log(`Created Linear issue ${issue.identifier} for task ${task.id}`);
			}
		} catch (error) {
			console.error(`Failed to sync task ${task.id} to Linear:`, error.message);
			throw error;
		}
	}

	/**
	 * Create a new Linear issue from a task
	 */
	async createLinearIssue(task, context = {}) {
		const issueInput = this.statusMapper.createLinearIssueInput(task, context, this.teamConfig);
		
		// Add external ID for tracking
		issueInput.externalId = this.linearClient.generateExternalId(task.id.toString());
		
		const issue = await this.linearClient.createIssue(issueInput);
		
		// Add initial comment with task details if needed
		if (task.subtasks && task.subtasks.length > 0) {
			const subtasksList = task.subtasks.map(st => `- ${st.title || st.description}`).join('\n');
			await this.linearClient.addComment(issue.id, `**Subtasks:**\n${subtasksList}`);
		}
		
		return issue;
	}

	/**
	 * Update an existing Linear issue
	 */
	async updateLinearIssue(issueId, task, context = {}) {
		if (!this.config.enableAutoUpdate) {
			return;
		}

		try {
			// Get current issue state
			const currentIssue = await this.linearClient.getIssue(issueId);
			if (!currentIssue) {
				console.warn(`Issue ${issueId} not found, removing from sync metadata`);
				this.syncMetadata.delete(`task_${task.id}`);
				return;
			}

			// Determine what needs to be updated
			const updates = {};
			const workflowStage = this.statusMapper.determineWorkflowStage(task, context);
			const expectedState = this.statusMapper.mapToLinearState(workflowStage);
			
			// Update state if different
			if (this.teamConfig?.stateMapping[expectedState] && 
				currentIssue.state.id !== this.teamConfig.stateMapping[expectedState]) {
				updates.stateId = this.teamConfig.stateMapping[expectedState];
			}
			
			// Update priority if different
			const expectedPriority = this.statusMapper.mapToLinearPriority(task.priority);
			if (currentIssue.priority !== expectedPriority) {
				updates.priority = expectedPriority;
			}
			
			// Update title if different
			if (currentIssue.title !== task.title) {
				updates.title = task.title;
			}
			
			// Update description if significantly different
			const newDescription = this.statusMapper.createLinearIssueInput(task, context, this.teamConfig).description;
			if (this.shouldUpdateDescription(currentIssue.description, newDescription)) {
				updates.description = newDescription;
			}
			
			// Apply updates if any
			if (Object.keys(updates).length > 0) {
				await this.linearClient.updateIssue(issueId, updates);
				this.syncStats.issuesUpdated++;
				
				console.log(`Updated Linear issue ${currentIssue.identifier} for task ${task.id}`);
			}
			
			// Add progress comment if task status changed
			if (context.statusChanged) {
				const comment = this.generateProgressComment(task, context);
				if (comment) {
					await this.linearClient.addComment(issueId, comment);
				}
			}
			
		} catch (error) {
			console.error(`Failed to update Linear issue ${issueId}:`, error.message);
			throw error;
		}
	}

	/**
	 * Sync Linear issues back to tasks
	 */
	async syncLinearToTasks(tasks) {
		const taskMap = new Map(tasks.map(task => [task.id, task]));
		let tasksUpdated = false;
		
		for (const [taskKey, issueId] of this.syncMetadata) {
			if (!taskKey.startsWith('task_')) continue;
			
			const taskId = parseInt(taskKey.replace('task_', ''));
			const task = taskMap.get(taskId);
			
			if (!task) {
				console.warn(`Task ${taskId} not found, but has Linear issue ${issueId}`);
				continue;
			}
			
			try {
				const updated = await this.syncLinearIssueToTask(issueId, task);
				if (updated) {
					tasksUpdated = true;
				}
			} catch (error) {
				console.error(`Failed to sync Linear issue ${issueId} to task ${taskId}:`, error.message);
			}
		}
		
		// Save tasks if any were updated
		if (tasksUpdated) {
			await this.saveTasks(tasks);
		}
	}

	/**
	 * Sync a Linear issue back to a task
	 */
	async syncLinearIssueToTask(issueId, task) {
		try {
			const issue = await this.linearClient.getIssue(issueId);
			if (!issue) {
				console.warn(`Linear issue ${issueId} not found`);
				return false;
			}
			
			let updated = false;
			
			// Update task status based on Linear state
			const newStatus = this.statusMapper.mapFromLinearState(issue.state.name);
			if (task.status !== newStatus) {
				task.previousStatus = task.status;
				task.status = newStatus;
				updated = true;
			}
			
			// Update priority
			const newPriority = this.statusMapper.mapFromLinearPriority(issue.priority || 2);
			if (task.priority !== newPriority) {
				task.priority = newPriority;
				updated = true;
			}
			
			// Update assignee if available
			if (issue.assignee && issue.assignee.email) {
				if (!task.assignee || task.assignee !== issue.assignee.email) {
					task.assignee = issue.assignee.email;
					updated = true;
				}
			}
			
			// Add Linear metadata
			if (!task.linearMetadata) {
				task.linearMetadata = {};
			}
			
			task.linearMetadata.issueId = issue.id;
			task.linearMetadata.identifier = issue.identifier;
			task.linearMetadata.url = issue.url;
			task.linearMetadata.lastSyncTime = new Date().toISOString();
			
			if (updated) {
				console.log(`Updated task ${task.id} from Linear issue ${issue.identifier}`);
			}
			
			return updated;
			
		} catch (error) {
			console.error(`Failed to sync Linear issue ${issueId}:`, error.message);
			return false;
		}
	}

	/**
	 * Handle task creation event
	 */
	async onTaskCreated(task) {
		if (!this.config.enableAutoCreate) {
			return;
		}

		try {
			await this.syncTaskToLinear(task, { statusChanged: true });
		} catch (error) {
			console.error(`Failed to handle task creation for task ${task.id}:`, error.message);
		}
	}

	/**
	 * Handle task update event
	 */
	async onTaskUpdated(task, previousTask) {
		try {
			const context = {
				statusChanged: task.status !== previousTask.status,
				previousStatus: previousTask.status
			};
			
			await this.syncTaskToLinear(task, context);
		} catch (error) {
			console.error(`Failed to handle task update for task ${task.id}:`, error.message);
		}
	}

	/**
	 * Handle PR creation event
	 */
	async onPRCreated(task, prUrl) {
		try {
			const context = {
				prUrl,
				statusChanged: true
			};
			
			await this.syncTaskToLinear(task, context);
		} catch (error) {
			console.error(`Failed to handle PR creation for task ${task.id}:`, error.message);
		}
	}

	/**
	 * Handle PR merge event
	 */
	async onPRMerged(task, prUrl) {
		try {
			const context = {
				prUrl,
				prMerged: true,
				statusChanged: true
			};
			
			await this.syncTaskToLinear(task, context);
			
			// Auto-close issue if enabled
			if (this.config.enableAutoClose && this.teamConfig?.stateMapping['Done']) {
				const taskKey = `task_${task.id}`;
				const issueId = this.syncMetadata.get(taskKey);
				
				if (issueId) {
					await this.linearClient.closeIssue(issueId, this.teamConfig.stateMapping['Done']);
					this.syncStats.issuesClosed++;
				}
			}
		} catch (error) {
			console.error(`Failed to handle PR merge for task ${task.id}:`, error.message);
		}
	}

	/**
	 * Handle error event
	 */
	async onError(task, error, context = {}) {
		try {
			const errorContext = {
				...context,
				error: true,
				errorMessage: error.message,
				statusChanged: true
			};
			
			await this.syncTaskToLinear(task, errorContext);
			
			// Add error comment
			const taskKey = `task_${task.id}`;
			const issueId = this.syncMetadata.get(taskKey);
			
			if (issueId) {
				const errorComment = `**Error occurred:**\n\`\`\`\n${error.message}\n\`\`\`\n\nTimestamp: ${new Date().toISOString()}`;
				await this.linearClient.addComment(issueId, errorComment);
			}
		} catch (syncError) {
			console.error(`Failed to handle error for task ${task.id}:`, syncError.message);
		}
	}

	/**
	 * Generate progress comment for task updates
	 */
	generateProgressComment(task, context) {
		if (!context.statusChanged) {
			return null;
		}
		
		let comment = `**Status Update:** ${context.previousStatus || 'unknown'} → ${task.status}`;
		
		if (context.prUrl) {
			comment += `\n\n**Related PR:** ${context.prUrl}`;
		}
		
		if (context.errorMessage) {
			comment += `\n\n**Error:** ${context.errorMessage}`;
		}
		
		comment += `\n\n*Updated automatically by claude-task-master*`;
		
		return comment;
	}

	/**
	 * Check if description should be updated
	 */
	shouldUpdateDescription(currentDescription, newDescription) {
		// Simple heuristic: update if the new description is significantly different
		if (!currentDescription || !newDescription) {
			return Boolean(newDescription);
		}
		
		// Remove metadata sections for comparison
		const cleanCurrent = currentDescription.replace(/---\n\*Generated by.*$/s, '').trim();
		const cleanNew = newDescription.replace(/---\n\*Generated by.*$/s, '').trim();
		
		// Update if content is significantly different (more than 20% change)
		const similarity = this.calculateSimilarity(cleanCurrent, cleanNew);
		return similarity < 0.8;
	}

	/**
	 * Calculate similarity between two strings
	 */
	calculateSimilarity(str1, str2) {
		const longer = str1.length > str2.length ? str1 : str2;
		const shorter = str1.length > str2.length ? str2 : str1;
		
		if (longer.length === 0) {
			return 1.0;
		}
		
		const editDistance = this.levenshteinDistance(longer, shorter);
		return (longer.length - editDistance) / longer.length;
	}

	/**
	 * Calculate Levenshtein distance between two strings
	 */
	levenshteinDistance(str1, str2) {
		const matrix = [];
		
		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}
		
		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}
		
		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1,
						matrix[i][j - 1] + 1,
						matrix[i - 1][j] + 1
					);
				}
			}
		}
		
		return matrix[str2.length][str1.length];
	}

	/**
	 * Get sync statistics
	 */
	getSyncStats() {
		return {
			...this.syncStats,
			isRunning: this.isRunning,
			lastSyncTime: this.lastSyncTime,
			trackedIssues: this.syncMetadata.size,
			rateLimitStatus: this.linearClient.getRateLimitStatus()
		};
	}

	/**
	 * Get Linear issue URL for a task
	 */
	getLinearIssueUrl(taskId) {
		const taskKey = `task_${taskId}`;
		const issueId = this.syncMetadata.get(taskKey);
		
		if (!issueId) {
			return null;
		}
		
		// Linear URLs follow the pattern: https://linear.app/{team}/{issue-identifier}
		if (this.teamConfig) {
			return `https://linear.app/${this.teamConfig.teamKey.toLowerCase()}/${issueId}`;
		}
		
		return null;
	}

	/**
	 * Clean up resources
	 */
	async cleanup() {
		this.stopAutoSync();
		await this.saveSyncMetadata();
		console.log('Linear sync engine cleaned up');
	}
}

export default LinearSyncEngine;

