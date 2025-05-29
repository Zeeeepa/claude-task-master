#!/usr/bin/env node

/**
 * AI Development Orchestrator
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
 * AI Development Orchestrator
 * Bridges Codegen SDK and Claude Code through AgentAPI middleware
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Get package information
const packageJson = require('./package.json');

// Export version information
export const version = packageJson.version;

// Export configuration utilities
export { getConfig, writeConfig, isConfigFilePresent } from './scripts/modules/config-manager.js';

// Export utility functions
export { findProjectRoot, log } from './scripts/modules/utils.js';

// Orchestrator class (placeholder for future implementation)
export class Orchestrator {
	constructor(config = {}) {
		this.config = config;
		this.isRunning = false;
	}

	async start() {
		console.log('🚀 Starting AI Development Orchestrator...');
		console.log('⚠️  Implementation pending - Phase 1.1 cleanup complete!');
		this.isRunning = true;
		return true;
	}

	async stop() {
		console.log('🛑 Stopping AI Development Orchestrator...');
		this.isRunning = false;
		return true;
	}

	getStatus() {
		return {
			running: this.isRunning,
			phase: '1.1 - Cleanup Complete',
			components: {
				codegen: 'Not implemented',
				claude: 'Not implemented',
				agentapi: 'Not implemented',
				linear: 'Not implemented',
				wsl2: 'Not implemented'
			}
		};
	}
}

// Default export
export default Orchestrator;

