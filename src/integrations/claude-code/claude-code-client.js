/**
 * Claude Code Client
 *
 * Main wrapper for Claude Code CLI interactions, providing a Node.js interface
 * for automated PR validation, debugging, and code quality analysis.
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import ClaudeCodeConfig from './config.js';

export class ClaudeCodeClient {
	constructor(options = {}) {
		this.config = new ClaudeCodeConfig(options);
		this.sessionId = null;
		this.isAuthenticated = false;
		this.timeout = options.timeout || 300000; // 5 minutes default
	}

	/**
	 * Initialize the Claude Code client
	 * @returns {Promise<boolean>} True if initialization successful
	 */
	async initialize() {
		try {
			// Validate Claude Code installation
			const isInstalled = await this.config.validateInstallation();
			if (!isInstalled) {
				throw new Error('Claude Code CLI is not installed or not accessible');
			}

			// Load configuration
			this.config.loadConfig();

			// Check authentication status
			this.isAuthenticated = await this.checkAuthentication();

			return true;
		} catch (error) {
			console.error('Failed to initialize Claude Code client:', error.message);
			return false;
		}
	}

	/**
	 * Check if Claude Code is authenticated
	 * @returns {Promise<boolean>} True if authenticated
	 */
	async checkAuthentication() {
		try {
			const result = await this.executeCommand(
				['config', 'get', 'auth.token'],
				{
					timeout: 10000,
					suppressOutput: true
				}
			);
			return result.success && result.output.trim().length > 0;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Execute a Claude Code command
	 * @param {Array} args - Command arguments
	 * @param {Object} options - Execution options
	 * @returns {Promise<Object>} Command result
	 */
	async executeCommand(args = [], options = {}) {
		return new Promise((resolve, reject) => {
			const {
				cwd = process.cwd(),
				timeout = this.timeout,
				input = null,
				suppressOutput = false
			} = options;

			const process = spawn('claude', args, {
				cwd,
				stdio: input ? 'pipe' : 'inherit',
				shell: true
			});

			let stdout = '';
			let stderr = '';

			if (process.stdout) {
				process.stdout.on('data', (data) => {
					const chunk = data.toString();
					stdout += chunk;
					if (!suppressOutput) {
						console.log(chunk);
					}
				});
			}

			if (process.stderr) {
				process.stderr.on('data', (data) => {
					const chunk = data.toString();
					stderr += chunk;
					if (!suppressOutput) {
						console.error(chunk);
					}
				});
			}

			// Handle input if provided
			if (input && process.stdin) {
				process.stdin.write(input);
				process.stdin.end();
			}

			// Set timeout
			const timeoutId = setTimeout(() => {
				process.kill('SIGTERM');
				reject(new Error(`Command timed out after ${timeout}ms`));
			}, timeout);

			process.on('close', (code) => {
				clearTimeout(timeoutId);
				resolve({
					success: code === 0,
					code,
					output: stdout,
					error: stderr,
					args
				});
			});

			process.on('error', (error) => {
				clearTimeout(timeoutId);
				reject(error);
			});
		});
	}

	/**
	 * Execute a query in non-interactive mode
	 * @param {string} query - The query to execute
	 * @param {Object} options - Query options
	 * @returns {Promise<Object>} Query result
	 */
	async query(query, options = {}) {
		const {
			outputFormat = 'json',
			systemPrompt = null,
			continueSession = false,
			sessionId = null,
			cwd = process.cwd()
		} = options;

		const args = ['-p', query];

		// Add configuration arguments
		const configArgs = this.config.generateCliArgs({
			outputFormat,
			...options
		});
		args.push(...configArgs);

		// Handle session management
		if (continueSession && this.sessionId) {
			args.unshift('-c');
		} else if (sessionId) {
			args.unshift('-r', sessionId);
		}

		// Add custom system prompt if provided
		if (systemPrompt) {
			args.push('--system-prompt', systemPrompt);
		}

		try {
			const result = await this.executeCommand(args, {
				cwd,
				suppressOutput: true,
				timeout: options.timeout || this.timeout
			});

			if (result.success && outputFormat === 'json') {
				try {
					const jsonOutput = this.parseJsonOutput(result.output);
					this.sessionId = jsonOutput.sessionId || this.sessionId;
					return {
						success: true,
						data: jsonOutput,
						sessionId: this.sessionId
					};
				} catch (parseError) {
					return {
						success: false,
						error: 'Failed to parse JSON output',
						rawOutput: result.output
					};
				}
			}

			return {
				success: result.success,
				data: result.output,
				error: result.error
			};
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * Parse JSON output from Claude Code
	 * @param {string} output - Raw output from Claude Code
	 * @returns {Object} Parsed JSON data
	 */
	parseJsonOutput(output) {
		const lines = output.trim().split('\n');
		const messages = [];
		let sessionId = null;
		let stats = null;

		for (const line of lines) {
			if (line.trim()) {
				try {
					const message = JSON.parse(line);
					messages.push(message);

					// Extract session ID and stats from system messages
					if (message.type === 'system') {
						if (message.content?.sessionId) {
							sessionId = message.content.sessionId;
						}
						if (message.content?.stats) {
							stats = message.content.stats;
						}
					}
				} catch (parseError) {
					console.warn('Failed to parse JSON line:', line);
				}
			}
		}

		return {
			messages,
			sessionId,
			stats,
			lastResponse:
				messages.filter((m) => m.role === 'assistant').pop()?.content || ''
		};
	}

	/**
	 * Analyze code quality for a specific file or directory
	 * @param {string} target - File or directory path to analyze
	 * @param {Object} options - Analysis options
	 * @returns {Promise<Object>} Analysis result
	 */
	async analyzeCodeQuality(target, options = {}) {
		const query = `Analyze the code quality of ${target}. Provide a comprehensive assessment including:
        1. Code complexity and maintainability
        2. Security vulnerabilities
        3. Performance issues
        4. Best practices compliance
        5. Technical debt assessment
        6. Specific recommendations for improvement
        
        Format the response as structured data with scores and actionable items.`;

		return await this.query(query, {
			...options,
			systemPrompt:
				'You are a senior code reviewer focused on quality, security, and maintainability. Provide detailed, actionable feedback.'
		});
	}

	/**
	 * Validate a pull request
	 * @param {string} prBranch - PR branch name
	 * @param {string} baseBranch - Base branch name
	 * @param {Object} options - Validation options
	 * @returns {Promise<Object>} Validation result
	 */
	async validatePullRequest(prBranch, baseBranch = 'main', options = {}) {
		const query = `Review the changes in branch ${prBranch} compared to ${baseBranch}. Perform a comprehensive PR validation including:
        1. Code quality assessment
        2. Security vulnerability scan
        3. Performance impact analysis
        4. Test coverage evaluation
        5. Documentation completeness
        6. Breaking changes detection
        7. Compliance with coding standards
        
        Provide a detailed report with approval/rejection recommendation and specific action items.`;

		return await this.query(query, {
			...options,
			systemPrompt:
				'You are an expert code reviewer performing PR validation. Focus on quality gates, security, and maintainability.'
		});
	}

	/**
	 * Debug build failures
	 * @param {string} errorLog - Build error log
	 * @param {Object} options - Debug options
	 * @returns {Promise<Object>} Debug suggestions
	 */
	async debugBuildFailure(errorLog, options = {}) {
		const query = `Analyze this build failure and provide debugging assistance:

        Error Log:
        ${errorLog}

        Please provide:
        1. Root cause analysis
        2. Step-by-step debugging approach
        3. Specific fixes or workarounds
        4. Prevention strategies
        5. Related documentation or resources`;

		return await this.query(query, {
			...options,
			systemPrompt:
				'You are a debugging expert. Provide clear, actionable solutions for build failures.'
		});
	}

	/**
	 * Generate performance analysis
	 * @param {string} target - Target to analyze
	 * @param {Object} options - Analysis options
	 * @returns {Promise<Object>} Performance analysis
	 */
	async analyzePerformance(target, options = {}) {
		const query = `Analyze the performance characteristics of ${target}. Include:
        1. Performance bottlenecks identification
        2. Memory usage analysis
        3. CPU utilization patterns
        4. I/O efficiency assessment
        5. Scalability considerations
        6. Optimization recommendations
        
        Provide specific, measurable improvements with expected impact.`;

		return await this.query(query, {
			...options,
			systemPrompt:
				'You are a performance optimization expert. Focus on measurable improvements and best practices.'
		});
	}

	/**
	 * Scan for security vulnerabilities
	 * @param {string} target - Target to scan
	 * @param {Object} options - Scan options
	 * @returns {Promise<Object>} Security scan results
	 */
	async scanSecurity(target, options = {}) {
		const query = `Perform a comprehensive security scan of ${target}. Include:
        1. Vulnerability identification (OWASP Top 10)
        2. Dependency security analysis
        3. Code injection risks
        4. Authentication/authorization issues
        5. Data exposure risks
        6. Security best practices compliance
        
        Provide severity ratings and remediation steps for each finding.`;

		return await this.query(query, {
			...options,
			systemPrompt:
				'You are a security expert. Focus on identifying vulnerabilities and providing clear remediation steps.'
		});
	}

	/**
	 * Continue the most recent conversation
	 * @param {string} query - Additional query
	 * @param {Object} options - Query options
	 * @returns {Promise<Object>} Continued conversation result
	 */
	async continueConversation(query, options = {}) {
		return await this.query(query, {
			...options,
			continueSession: true
		});
	}

	/**
	 * Resume a specific session
	 * @param {string} sessionId - Session ID to resume
	 * @param {string} query - Query for the resumed session
	 * @param {Object} options - Query options
	 * @returns {Promise<Object>} Resumed session result
	 */
	async resumeSession(sessionId, query, options = {}) {
		return await this.query(query, {
			...options,
			sessionId
		});
	}

	/**
	 * Get current session ID
	 * @returns {string|null} Current session ID
	 */
	getSessionId() {
		return this.sessionId;
	}

	/**
	 * Reset session
	 */
	resetSession() {
		this.sessionId = null;
	}

	/**
	 * Get client status
	 * @returns {Object} Client status information
	 */
	getStatus() {
		return {
			isAuthenticated: this.isAuthenticated,
			sessionId: this.sessionId,
			config: this.config.getConfig()
		};
	}
}

export default ClaudeCodeClient;
