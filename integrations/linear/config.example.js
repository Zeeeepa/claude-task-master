/**
 * integrations/linear/config.example.js
 * Example configuration for Linear integration
 */

export const linearConfig = {
	// Required: Linear API Configuration
	apiKey: process.env.LINEAR_API_KEY, // Get from Linear Settings > API
	teamId: process.env.LINEAR_TEAM_ID, // Your Linear team ID
	projectId: process.env.LINEAR_PROJECT_ID, // Optional: specific project ID

	// Sync Configuration
	enableAutoSync: true, // Enable automatic synchronization
	syncInterval: 300000, // Sync every 5 minutes (300000ms)
	enableBidirectionalSync: true, // Sync changes from Linear back to tasks
	enableAutoCreate: true, // Automatically create Linear issues for new tasks
	enableAutoUpdate: true, // Automatically update Linear issues when tasks change
	enableAutoClose: true, // Automatically close Linear issues when tasks are completed

	// Webhook Configuration
	enableWebhooks: true, // Enable webhook server for real-time updates
	webhookPort: 3000, // Port for webhook server
	webhookPath: '/webhooks', // Base path for webhooks
	githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET, // GitHub webhook secret
	linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET, // Linear webhook secret

	// Rate Limiting
	rateLimitThreshold: 0.8, // Use up to 80% of API rate limit
	retryAttempts: 3, // Number of retry attempts for failed requests

	// Custom Status Mapping
	statusMapping: {
		status: {
			// Task Master status -> Linear state name
			'pending': 'Backlog',
			'in-progress': 'In Progress',
			'done': 'Done',
			'deferred': 'Backlog',
			'blocked': 'Blocked',
			
			// Workflow states -> Linear state names
			'task_created': 'Backlog',
			'pr_created': 'In Progress',
			'validation_running': 'In Review',
			'validation_failed': 'Needs Fix',
			'validation_passed': 'Ready for Merge',
			'pr_merged': 'Done',
			'error': 'Needs Fix',
			'cancelled': 'Cancelled'
		},
		priority: {
			// Task Master priority -> Linear priority (0-4)
			'low': 1,
			'medium': 2,
			'high': 3,
			'urgent': 4
		},
		labels: {
			// Task types -> Linear label names
			'bug': 'bug',
			'feature': 'feature',
			'enhancement': 'enhancement',
			'documentation': 'documentation',
			'refactor': 'refactor',
			'test': 'testing',
			
			// Status indicators -> Linear label names
			'automated': 'automated',
			'ai-generated': 'ai-generated',
			'needs-review': 'needs-review',
			'high-priority': 'high-priority'
		}
	}
};

// Environment Variables Setup Guide
export const envSetupGuide = {
	required: [
		{
			name: 'LINEAR_API_KEY',
			description: 'Your Linear API key',
			howToGet: 'Go to Linear Settings > API > Create new API key'
		},
		{
			name: 'LINEAR_TEAM_ID',
			description: 'Your Linear team ID',
			howToGet: 'Go to your Linear team settings, copy the team ID from the URL'
		}
	],
	optional: [
		{
			name: 'LINEAR_PROJECT_ID',
			description: 'Specific Linear project ID (optional)',
			howToGet: 'Go to your Linear project, copy the project ID from the URL'
		},
		{
			name: 'GITHUB_WEBHOOK_SECRET',
			description: 'GitHub webhook secret for signature verification',
			howToGet: 'Set this when configuring GitHub webhooks'
		},
		{
			name: 'LINEAR_WEBHOOK_SECRET',
			description: 'Linear webhook secret for signature verification',
			howToGet: 'Set this when configuring Linear webhooks'
		},
		{
			name: 'WEBHOOK_PORT',
			description: 'Port for webhook server (default: 3000)',
			howToGet: 'Choose an available port on your server'
		}
	]
};

// Webhook URLs for configuration
export const webhookUrls = {
	github: {
		url: 'https://your-domain.com/webhooks/github',
		events: [
			'pull_request',
			'push',
			'workflow_run',
			'check_run'
		],
		contentType: 'application/json'
	},
	linear: {
		url: 'https://your-domain.com/webhooks/linear',
		events: [
			'Issue',
			'Comment'
		]
	}
};

export default linearConfig;

