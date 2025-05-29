#!/usr/bin/env node

/**
 * Task Master - AI Development Orchestrator
 * Copyright (c) 2025 Eyal Toledano, Ralph Khreish
 *
 * This software is licensed under the MIT License with Commons Clause.
 * You may use this software for any purpose, including commercial applications,
 * and modify and redistribute it freely, subject to the following restrictions:
 *
 * 1. You may not sell this software or offer it as a service.
 * 2. The origin of this software must not be misrepresented.
 * 3. Altered source versions must be plainly marked as such.
 *
 * For the full license text, see the LICENSE file in the root directory.
 */

/**
 * AI Development Orchestrator CLI
 * Main entry point for the orchestrator system
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Get package information
const packageJson = require('../package.json');
const version = packageJson.version;

// Display banner
function displayBanner() {
	console.log(
		gradient.rainbow(
			figlet.textSync('Task Master', {
				font: 'Small',
				horizontalLayout: 'default',
				verticalLayout: 'default'
			})
		)
	);
	console.log(chalk.cyan(`AI Development Orchestrator v${version}`));
	console.log(chalk.gray('Bridges Codegen SDK and Claude Code through AgentAPI middleware\n'));
}

// Display help information
function displayHelp() {
	console.log(chalk.yellow('🚀 AI Development Orchestrator Commands:\n'));
	
	console.log(chalk.green('  orchestrate') + '     Start the AI development orchestrator');
	console.log(chalk.green('  status') + '          Show orchestrator status');
	console.log(chalk.green('  config') + '          Configure Codegen SDK and Claude Code integration');
	console.log(chalk.green('  logs') + '            View orchestrator logs');
	console.log(chalk.green('  --version') + '       Show version information');
	console.log(chalk.green('  --help') + '          Show this help message\n');
	
	console.log(chalk.yellow('📖 Examples:\n'));
	console.log(chalk.gray('  task-master orchestrate    # Start the orchestrator'));
	console.log(chalk.gray('  task-master status          # Check system status'));
	console.log(chalk.gray('  task-master config          # Configure integrations\n'));
	
	console.log(chalk.blue('🔗 For more information, visit: https://github.com/eyaltoledano/claude-task-master'));
}

// Placeholder orchestrator function
async function startOrchestrator() {
	console.log(chalk.yellow('🚀 Starting AI Development Orchestrator...'));
	console.log(chalk.gray('This is a placeholder for the new orchestrator system.'));
	console.log(chalk.gray('The orchestrator will integrate:'));
	console.log(chalk.gray('  • Codegen SDK (token + org_id)'));
	console.log(chalk.gray('  • Claude Code (webClientConfirmation)'));
	console.log(chalk.gray('  • AgentAPI middleware'));
	console.log(chalk.gray('  • Linear integration'));
	console.log(chalk.gray('  • WSL2 deployment automation\n'));
	
	console.log(chalk.red('⚠️  Implementation pending - Phase 1.1 cleanup complete!'));
}

// Show status
async function showStatus() {
	console.log(chalk.yellow('📊 Orchestrator Status:'));
	console.log(chalk.gray('Status: ') + chalk.red('Not implemented yet'));
	console.log(chalk.gray('Phase: ') + chalk.green('1.1 - Cleanup Complete'));
}

// Configuration
async function configure() {
	console.log(chalk.yellow('⚙️  Configuration:'));
	console.log(chalk.gray('Configuration system will be implemented in Phase 1.2'));
}

// Show logs
async function showLogs() {
	console.log(chalk.yellow('📋 Orchestrator Logs:'));
	console.log(chalk.gray('Logging system will be implemented in Phase 1.2'));
}

// Set up the command-line interface
const program = new Command();

program
	.name('task-master')
	.description('AI Development Orchestrator CLI')
	.version(version);

program
	.command('orchestrate')
	.description('Start the AI development orchestrator')
	.action(startOrchestrator);

program
	.command('status')
	.description('Show orchestrator status')
	.action(showStatus);

program
	.command('config')
	.description('Configure Codegen SDK and Claude Code integration')
	.action(configure);

program
	.command('logs')
	.description('View orchestrator logs')
	.action(showLogs);

// Custom help handling
program.helpOption('-h, --help', 'Display help information');
program.on('--help', () => {
	displayHelp();
});

// Parse the command line arguments
program.parse(process.argv);

// Show help if no command was provided
if (process.argv.length <= 2) {
	displayBanner();
	displayHelp();
	process.exit(0);
}

// Global error handling
process.on('uncaughtException', (err) => {
	console.error(chalk.red(`Error: ${err.message}`));
	if (process.env.DEBUG === '1') {
		console.error(err);
	}
	process.exit(1);
});

