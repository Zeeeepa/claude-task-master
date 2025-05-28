#!/usr/bin/env node

/**
 * examples/linear-integration-example.js
 * Example usage of Linear integration
 */

import { LinearIntegration } from '../integrations/linear/index.js';
import { config } from 'dotenv';

// Load environment variables
config();

async function main() {
	console.log('🚀 Linear Integration Example\n');

	try {
		// Initialize Linear integration
		console.log('1. Initializing Linear integration...');
		const linear = new LinearIntegration({
			apiKey: process.env.LINEAR_API_KEY,
			teamId: process.env.LINEAR_TEAM_ID,
			enableAutoSync: false, // Disable auto-sync for this example
			enableWebhooks: false  // Disable webhooks for this example
		});

		await linear.initialize();
		console.log('✅ Linear integration initialized successfully\n');

		// Test connection
		console.log('2. Testing Linear connection...');
		const connectionResult = await linear.testConnection();
		
		if (connectionResult.success) {
			console.log('✅ Connection successful!');
			if (connectionResult.team) {
				console.log(`   Team: ${connectionResult.team.name} (${connectionResult.team.key})`);
			}
		} else {
			console.error('❌ Connection failed:', connectionResult.error);
			return;
		}
		console.log('');

		// Create a sample task
		console.log('3. Creating sample task...');
		const sampleTask = {
			id: Date.now(), // Use timestamp as unique ID
			title: 'Example Task: Implement Linear Integration',
			description: 'This is an example task to demonstrate Linear integration capabilities.',
			status: 'pending',
			priority: 'high',
			details: `
Implementation details:
- Set up Linear API client
- Implement status mapping
- Add webhook support
- Create comprehensive tests
			`.trim(),
			testStrategy: `
Test strategy:
1. Unit tests for API client
2. Integration tests for sync engine
3. End-to-end tests with real Linear API
4. Manual testing with webhook events
			`.trim(),
			dependencies: [],
			subtasks: [
				{ title: 'Set up Linear API client', status: 'done' },
				{ title: 'Implement status mapping', status: 'done' },
				{ title: 'Add webhook support', status: 'in-progress' },
				{ title: 'Create tests', status: 'pending' }
			],
			aiGenerated: true,
			type: 'feature'
		};

		// Sync task to Linear
		console.log('4. Syncing task to Linear...');
		await linear.syncTask(sampleTask);
		
		const issueUrl = linear.getLinearIssueUrl(sampleTask.id);
		console.log('✅ Task synced to Linear successfully!');
		if (issueUrl) {
			console.log(`   Linear Issue URL: ${issueUrl}`);
		}
		console.log('');

		// Simulate PR creation
		console.log('5. Simulating PR creation...');
		const prUrl = 'https://github.com/example/repo/pull/123';
		await linear.onPRCreated(sampleTask, prUrl);
		console.log('✅ PR creation event handled');
		console.log(`   PR URL: ${prUrl}`);
		console.log('');

		// Update task status
		console.log('6. Updating task status...');
		const previousTask = { ...sampleTask };
		sampleTask.status = 'in-progress';
		await linear.onTaskUpdated(sampleTask, previousTask);
		console.log('✅ Task status updated to "in-progress"');
		console.log('');

		// Simulate PR merge
		console.log('7. Simulating PR merge...');
		sampleTask.status = 'done';
		await linear.onPRMerged(sampleTask, prUrl);
		console.log('✅ PR merge event handled');
		console.log('   Task marked as completed');
		console.log('');

		// Get sync statistics
		console.log('8. Getting sync statistics...');
		const stats = linear.getSyncStats();
		console.log('📊 Sync Statistics:');
		console.log(`   Total syncs: ${stats.totalSyncs}`);
		console.log(`   Successful syncs: ${stats.successfulSyncs}`);
		console.log(`   Failed syncs: ${stats.failedSyncs}`);
		console.log(`   Issues created: ${stats.issuesCreated}`);
		console.log(`   Issues updated: ${stats.issuesUpdated}`);
		console.log(`   Tracked issues: ${stats.trackedIssues}`);
		console.log('');

		// Get rate limit status
		console.log('9. Checking rate limit status...');
		const rateLimitStatus = linear.getRateLimitStatus();
		console.log('📈 Rate Limit Status:');
		console.log(`   Remaining: ${rateLimitStatus.remaining || 'Unknown'}`);
		console.log(`   Limit: ${rateLimitStatus.limit || 'Unknown'}`);
		console.log(`   Usage: ${rateLimitStatus.usagePercentage?.toFixed(1) || 'Unknown'}%`);
		console.log('');

		// Demonstrate error handling
		console.log('10. Demonstrating error handling...');
		const error = new Error('Example build failure');
		await linear.onError(sampleTask, error, {
			buildUrl: 'https://github.com/example/repo/actions/runs/123',
			step: 'test'
		});
		console.log('✅ Error event handled');
		console.log('   Error comment added to Linear issue');
		console.log('');

		console.log('🎉 Linear integration example completed successfully!');
		console.log('\nNext steps:');
		console.log('- Check your Linear team for the created issue');
		console.log('- Set up webhooks for real-time synchronization');
		console.log('- Enable auto-sync for continuous integration');
		console.log('- Customize status mapping for your workflow');

	} catch (error) {
		console.error('❌ Example failed:', error.message);
		console.error('\nTroubleshooting:');
		console.error('- Check your LINEAR_API_KEY environment variable');
		console.error('- Verify your LINEAR_TEAM_ID is correct');
		console.error('- Ensure you have proper permissions in Linear');
		console.error('- Run "npx linear-test test-connection" to diagnose issues');
		process.exit(1);
	}
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n👋 Shutting down gracefully...');
	process.exit(0);
});

// Run the example
main().catch(error => {
	console.error('💥 Unexpected error:', error);
	process.exit(1);
});

