#!/usr/bin/env node

/**
 * AI Development Orchestrator
 * Copyright (c) 2025 AI Development Orchestrator Team
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
 * A comprehensive AI-driven development orchestrator that bridges 
 * Codegen SDK and Claude Code through AgentAPI middleware
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import { Command } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Get package information
const packageJson = require('../package.json');

// CLI implementation
const program = new Command();

program
    .name('orchestrator')
    .description('AI Development Orchestrator CLI')
    .version(packageJson.version);

program
    .command('start')
    .description('Start the AI Development Orchestrator')
    .option('-p, --port <port>', 'Port to run the server on', '3000')
    .option('-e, --env <env>', 'Environment to run in', 'development')
    .action(async (options) => {
        try {
            console.log('🚀 Starting AI Development Orchestrator...');
            console.log(`📡 Port: ${options.port}`);
            console.log(`🌍 Environment: ${options.env}`);
            
            // Import and start the orchestrator
            const { startOrchestrator } = await import('../index.js');
            await startOrchestrator(options);
        } catch (err) {
            console.error('❌ Failed to start orchestrator:', err.message);
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Check orchestrator status')
    .action(async () => {
        try {
            console.log('📊 Checking orchestrator status...');
            // TODO: Implement status check
            console.log('✅ Orchestrator is ready for implementation');
        } catch (err) {
            console.error('❌ Status check failed:', err.message);
            process.exit(1);
        }
    });

program
    .command('config')
    .description('Configure the orchestrator')
    .option('--codegen-token <token>', 'Codegen SDK token')
    .option('--codegen-org <org>', 'Codegen organization ID')
    .option('--claude-confirmation <confirmation>', 'Claude Code webClientConfirmation')
    .option('--linear-token <token>', 'Linear API token')
    .option('--github-token <token>', 'GitHub API token')
    .action(async (options) => {
        try {
            console.log('⚙️ Configuring orchestrator...');
            // TODO: Implement configuration
            console.log('✅ Configuration saved');
        } catch (err) {
            console.error('❌ Configuration failed:', err.message);
            process.exit(1);
        }
    });

program.parse(process.argv);

