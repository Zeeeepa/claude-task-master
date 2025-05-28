#!/usr/bin/env node

/**
 * bin/linear-test.js
 * CLI tool for testing Linear integration
 */

import { Command } from 'commander';
import { LinearIntegration } from '../integrations/linear/index.js';
import chalk from 'chalk';
import ora from 'ora';

const program = new Command();

program
	.name('linear-test')
	.description('Test Linear API integration')
	.version('1.0.0');

// Test connection command
program
	.command('test-connection')
	.description('Test Linear API connection')
	.option('--api-key <key>', 'Linear API key')
	.option('--team-id <id>', 'Linear team ID')
	.action(async (options) => {
		const spinner = ora('Testing Linear connection...').start();
		
		try {
			const integration = new LinearIntegration({
				apiKey: options.apiKey || process.env.LINEAR_API_KEY,
				teamId: options.teamId || process.env.LINEAR_TEAM_ID,
				enableAutoSync: false,
				enableWebhooks: false
			});

			const result = await integration.testConnection();
			
			if (result.success) {
				spinner.succeed(chalk.green('Linear connection successful!'));
				
				if (result.team) {
					console.log(chalk.blue('\nTeam Information:'));
					console.log(`  Name: ${result.team.name}`);
					console.log(`  Key: ${result.team.key}`);
					console.log(`  ID: ${result.team.id}`);
				}
				
				if (result.viewer) {
					console.log(chalk.blue('\nViewer Information:'));
					console.log(`  Name: ${result.viewer.name}`);
					console.log(`  Email: ${result.viewer.email}`);
					console.log(`  ID: ${result.viewer.id}`);
				}
				
				if (result.rateLimitStatus) {
					console.log(chalk.blue('\nRate Limit Status:'));
					console.log(`  Remaining: ${result.rateLimitStatus.remaining || 'Unknown'}`);
					console.log(`  Limit: ${result.rateLimitStatus.limit || 'Unknown'}`);
					console.log(`  Usage: ${result.rateLimitStatus.usagePercentage?.toFixed(1) || 'Unknown'}%`);
				}
			} else {
				spinner.fail(chalk.red('Linear connection failed!'));
				console.error(chalk.red(`Error: ${result.error}`));
				process.exit(1);
			}
		} catch (error) {
			spinner.fail(chalk.red('Linear connection failed!'));
			console.error(chalk.red(`Error: ${error.message}`));
			process.exit(1);
		}
	});

// Create test issue command
program
	.command('create-test-issue')
	.description('Create a test Linear issue')
	.option('--api-key <key>', 'Linear API key')
	.option('--team-id <id>', 'Linear team ID')
	.option('--title <title>', 'Issue title', 'Test Issue from claude-task-master')
	.option('--description <desc>', 'Issue description', 'This is a test issue created by the Linear integration.')
	.action(async (options) => {
		const spinner = ora('Creating test Linear issue...').start();
		
		try {
			const integration = new LinearIntegration({
				apiKey: options.apiKey || process.env.LINEAR_API_KEY,
				teamId: options.teamId || process.env.LINEAR_TEAM_ID,
				enableAutoSync: false,
				enableWebhooks: false
			});

			await integration.initialize();

			const testTask = {
				id: 999999,
				title: options.title,
				description: options.description,
				status: 'pending',
				priority: 'medium',
				details: 'This is a test task created to verify Linear integration functionality.',
				testStrategy: 'Manual verification that the issue appears in Linear with correct information.',
				dependencies: [],
				subtasks: []
			};

			const issue = await integration.createIssueFromTask(testTask);
			
			spinner.succeed(chalk.green('Test Linear issue created successfully!'));
			
			console.log(chalk.blue('\nIssue Information:'));
			console.log(`  Title: ${issue.title}`);
			console.log(`  Identifier: ${issue.identifier}`);
			console.log(`  URL: ${issue.url}`);
			console.log(`  State: ${issue.state.name}`);
			console.log(`  Team: ${issue.team.name} (${issue.team.key})`);
			
		} catch (error) {
			spinner.fail(chalk.red('Failed to create test issue!'));
			console.error(chalk.red(`Error: ${error.message}`));
			process.exit(1);
		}
	});

// Sync test command
program
	.command('sync-test')
	.description('Test task synchronization')
	.option('--api-key <key>', 'Linear API key')
	.option('--team-id <id>', 'Linear team ID')
	.option('--task-id <id>', 'Task ID to sync', '1')
	.action(async (options) => {
		const spinner = ora('Testing task synchronization...').start();
		
		try {
			const integration = new LinearIntegration({
				apiKey: options.apiKey || process.env.LINEAR_API_KEY,
				teamId: options.teamId || process.env.LINEAR_TEAM_ID,
				enableAutoSync: false,
				enableWebhooks: false
			});

			await integration.initialize();

			// Load tasks
			const tasks = await integration.syncEngine.loadTasks();
			const taskId = parseInt(options.taskId);
			const task = tasks.find(t => t.id === taskId);
			
			if (!task) {
				spinner.fail(chalk.red(`Task ${taskId} not found!`));
				console.log(chalk.yellow(`Available tasks: ${tasks.map(t => t.id).join(', ')}`));
				process.exit(1);
			}

			await integration.syncTask(task);
			
			const issueUrl = integration.getLinearIssueUrl(taskId);
			
			spinner.succeed(chalk.green('Task synchronized successfully!'));
			
			console.log(chalk.blue('\nSync Information:'));
			console.log(`  Task ID: ${task.id}`);
			console.log(`  Task Title: ${task.title}`);
			console.log(`  Task Status: ${task.status}`);
			console.log(`  Linear Issue URL: ${issueUrl || 'Not available'}`);
			
		} catch (error) {
			spinner.fail(chalk.red('Task synchronization failed!'));
			console.error(chalk.red(`Error: ${error.message}`));
			process.exit(1);
		}
	});

// Status mapping test command
program
	.command('test-mapping')
	.description('Test status mapping configuration')
	.action(async () => {
		const { StatusMapper } = await import('../integrations/linear/status-mapping.js');
		
		console.log(chalk.blue('Testing Status Mapping...\n'));
		
		const mapper = new StatusMapper();
		
		// Test status mapping
		console.log(chalk.green('Status Mapping:'));
		const statuses = ['pending', 'in-progress', 'done', 'deferred', 'blocked'];
		for (const status of statuses) {
			const linearState = mapper.mapToLinearState(status);
			const backToTask = mapper.mapFromLinearState(linearState);
			console.log(`  ${status} → ${linearState} → ${backToTask}`);
		}
		
		// Test priority mapping
		console.log(chalk.green('\nPriority Mapping:'));
		const priorities = ['low', 'medium', 'high', 'urgent'];
		for (const priority of priorities) {
			const linearPriority = mapper.mapToLinearPriority(priority);
			const backToTask = mapper.mapFromLinearPriority(linearPriority);
			console.log(`  ${priority} → ${linearPriority} → ${backToTask}`);
		}
		
		// Test workflow stages
		console.log(chalk.green('\nWorkflow Stage Mapping:'));
		const workflows = ['task_created', 'pr_created', 'validation_running', 'validation_failed', 'validation_passed', 'pr_merged'];
		for (const workflow of workflows) {
			const linearState = mapper.mapToLinearState(workflow);
			console.log(`  ${workflow} → ${linearState}`);
		}
		
		// Test label generation
		console.log(chalk.green('\nLabel Generation:'));
		const testTask = {
			type: 'feature',
			priority: 'high',
			aiGenerated: true,
			labels: ['custom-label']
		};
		const labels = mapper.getLabelsForTask(testTask);
		console.log(`  Test task labels: ${labels.join(', ')}`);
	});

// Environment check command
program
	.command('check-env')
	.description('Check environment variables and configuration')
	.action(() => {
		console.log(chalk.blue('Environment Configuration Check:\n'));
		
		const requiredVars = [
			{ name: 'LINEAR_API_KEY', value: process.env.LINEAR_API_KEY },
			{ name: 'LINEAR_TEAM_ID', value: process.env.LINEAR_TEAM_ID }
		];
		
		const optionalVars = [
			{ name: 'LINEAR_PROJECT_ID', value: process.env.LINEAR_PROJECT_ID },
			{ name: 'GITHUB_WEBHOOK_SECRET', value: process.env.GITHUB_WEBHOOK_SECRET },
			{ name: 'LINEAR_WEBHOOK_SECRET', value: process.env.LINEAR_WEBHOOK_SECRET },
			{ name: 'WEBHOOK_PORT', value: process.env.WEBHOOK_PORT }
		];
		
		console.log(chalk.green('Required Variables:'));
		for (const variable of requiredVars) {
			const status = variable.value ? chalk.green('✓ Set') : chalk.red('✗ Missing');
			const value = variable.value ? `(${variable.value.substring(0, 10)}...)` : '';
			console.log(`  ${variable.name}: ${status} ${value}`);
		}
		
		console.log(chalk.blue('\nOptional Variables:'));
		for (const variable of optionalVars) {
			const status = variable.value ? chalk.green('✓ Set') : chalk.yellow('○ Not set');
			const value = variable.value ? `(${variable.value.substring(0, 10)}...)` : '';
			console.log(`  ${variable.name}: ${status} ${value}`);
		}
		
		// Check for tasks.json
		console.log(chalk.blue('\nProject Files:'));
		try {
			const fs = await import('fs/promises');
			await fs.access('tasks/tasks.json');
			console.log(`  tasks/tasks.json: ${chalk.green('✓ Found')}`);
		} catch {
			console.log(`  tasks/tasks.json: ${chalk.red('✗ Not found')}`);
		}
	});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
	program.outputHelp();
}

