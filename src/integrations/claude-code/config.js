/**
 * Claude Code Integration Configuration
 *
 * Manages configuration settings for Claude Code CLI integration
 * including authentication, output formats, and tool permissions.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class ClaudeCodeConfig {
	constructor(options = {}) {
		this.options = {
			// Default configuration
			outputFormat: 'json',
			maxTurns: 5,
			verbose: false,
			allowedTools: [
				'Bash(npm install)',
				'Bash(npm test)',
				'Bash(npm run lint)',
				'Bash(git status)',
				'Bash(git diff)',
				'FileEditor',
				'FileViewer',
				'WebSearch'
			],
			disallowedTools: ['Bash(rm -rf)', 'Bash(sudo)', 'Bash(git push --force)'],
			systemPromptAppend:
				'Focus on code quality, security, and best practices. Provide actionable feedback.',
			...options
		};

		this.configPath = join(homedir(), '.claude-code-integration');
	}

	/**
	 * Get configuration for Claude Code CLI
	 * @returns {Object} Configuration object
	 */
	getConfig() {
		return {
			outputFormat: this.options.outputFormat,
			maxTurns: this.options.maxTurns,
			verbose: this.options.verbose,
			allowedTools: this.options.allowedTools.join(','),
			disallowedTools: this.options.disallowedTools.join(','),
			systemPromptAppend: this.options.systemPromptAppend
		};
	}

	/**
	 * Generate CLI arguments for Claude Code
	 * @param {Object} overrides - Override default configuration
	 * @returns {Array} Array of CLI arguments
	 */
	generateCliArgs(overrides = {}) {
		const config = { ...this.getConfig(), ...overrides };
		const args = [];

		if (config.outputFormat) {
			args.push('--output-format', config.outputFormat);
		}

		if (config.maxTurns) {
			args.push('--max-turns', config.maxTurns.toString());
		}

		if (config.verbose) {
			args.push('--verbose');
		}

		if (config.allowedTools) {
			args.push('--allowedTools', config.allowedTools);
		}

		if (config.disallowedTools) {
			args.push('--disallowedTools', config.disallowedTools);
		}

		if (config.systemPromptAppend) {
			args.push('--append-system-prompt', config.systemPromptAppend);
		}

		return args;
	}

	/**
	 * Create MCP configuration for Claude Code
	 * @param {Array} mcpServers - Array of MCP server configurations
	 * @returns {string} Path to MCP configuration file
	 */
	createMcpConfig(mcpServers = []) {
		const mcpConfig = {
			mcpServers: mcpServers.reduce((acc, server) => {
				acc[server.name] = {
					command: server.command,
					args: server.args || [],
					env: server.env || {}
				};
				return acc;
			}, {})
		};

		const mcpConfigPath = join(this.configPath, 'mcp-config.json');
		writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
		return mcpConfigPath;
	}

	/**
	 * Load saved configuration
	 * @returns {Object} Saved configuration or default
	 */
	loadConfig() {
		try {
			if (existsSync(this.configPath)) {
				const savedConfig = JSON.parse(readFileSync(this.configPath, 'utf8'));
				this.options = { ...this.options, ...savedConfig };
			}
		} catch (error) {
			console.warn('Failed to load Claude Code configuration:', error.message);
		}
		return this.options;
	}

	/**
	 * Save configuration to disk
	 * @param {Object} config - Configuration to save
	 */
	saveConfig(config = {}) {
		try {
			const configToSave = { ...this.options, ...config };
			writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
			this.options = configToSave;
		} catch (error) {
			console.error('Failed to save Claude Code configuration:', error.message);
		}
	}

	/**
	 * Validate Claude Code installation
	 * @returns {Promise<boolean>} True if Claude Code is installed and accessible
	 */
	async validateInstallation() {
		try {
			const { spawn } = await import('child_process');
			return new Promise((resolve) => {
				const process = spawn('claude', ['--version'], { stdio: 'pipe' });
				process.on('close', (code) => {
					resolve(code === 0);
				});
				process.on('error', () => {
					resolve(false);
				});
			});
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get quality gate thresholds
	 * @returns {Object} Quality gate configuration
	 */
	getQualityGates() {
		return {
			codeQuality: {
				minScore: 0.8,
				maxComplexity: 10,
				maxDuplication: 0.1
			},
			security: {
				maxVulnerabilities: 0,
				allowedSeverities: ['low', 'medium']
			},
			performance: {
				maxResponseTime: 5000,
				minCoverage: 0.9
			},
			maintainability: {
				minReadability: 0.7,
				maxTechnicalDebt: 0.2
			}
		};
	}
}

export default ClaudeCodeConfig;
