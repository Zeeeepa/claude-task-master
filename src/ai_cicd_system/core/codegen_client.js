/**
 * @fileoverview Real Codegen HTTP Client
 * @description Production-grade Codegen API client based on Python SDK patterns
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Codegen Agent - mimics the Python SDK Agent class
 */
export class CodegenAgent {
	constructor(config) {
		this.orgId = config.org_id;
		this.token = config.token;
		this.baseURL = config.baseURL || 'https://api.codegen.sh';
		this.timeout = config.timeout || 120000; // 2 minutes
		this.retries = config.retries || 3;
		this.retryDelay = config.retryDelay || 1000;

		// Validate required config
		if (!this.orgId || !this.token) {
			throw new Error('Codegen Agent requires org_id and token');
		}

		log('debug', `Initialized Codegen Agent for org ${this.orgId}`);
	}

	/**
	 * Run a task with the Codegen API
	 * @param {string} prompt - Task description/prompt
	 * @param {Object} options - Additional options
	 * @returns {Promise<CodegenTask>} Task object
	 */
	async run(prompt, options = {}) {
		log('info', `Creating Codegen task: ${prompt.substring(0, 100)}...`);

		const taskData = {
			prompt: prompt,
			org_id: this.orgId,
			...options
		};

		try {
			const response = await this._makeRequest('POST', '/v1/tasks', taskData);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const taskResult = await response.json();

			// Create and return a CodegenTask instance
			const task = new CodegenTask(taskResult.id, this, taskResult);

			log(
				'info',
				`Created Codegen task ${task.id} with status: ${task.status}`
			);
			return task;
		} catch (error) {
			log('error', `Failed to create Codegen task: ${error.message}`);
			throw new CodegenError('TASK_CREATION_FAILED', error.message, error);
		}
	}

	/**
	 * Get task status by ID
	 * @param {string} taskId - Task identifier
	 * @returns {Promise<Object>} Task data
	 */
	async getTask(taskId) {
		try {
			const response = await this._makeRequest('GET', `/v1/tasks/${taskId}`);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return await response.json();
		} catch (error) {
			log('error', `Failed to get task ${taskId}: ${error.message}`);
			throw new CodegenError('TASK_FETCH_FAILED', error.message, error);
		}
	}

	/**
	 * Make HTTP request with retry logic
	 * @param {string} method - HTTP method
	 * @param {string} endpoint - API endpoint
	 * @param {Object} data - Request data
	 * @returns {Promise<Response>} HTTP response
	 * @private
	 */
	async _makeRequest(method, endpoint, data = null) {
		const url = `${this.baseURL}${endpoint}`;

		const headers = {
			Authorization: `Bearer ${this.token}`,
			'Content-Type': 'application/json',
			'User-Agent': 'claude-task-master/1.0.0'
		};

		const requestOptions = {
			method,
			headers,
			timeout: this.timeout
		};

		if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
			requestOptions.body = JSON.stringify(data);
		}

		let lastError;

		for (let attempt = 1; attempt <= this.retries; attempt++) {
			try {
				log(
					'debug',
					`Making ${method} request to ${url} (attempt ${attempt}/${this.retries})`
				);

				const response = await fetch(url, requestOptions);

				// If successful or non-retryable error, return immediately
				if (response.ok || !this._isRetryableError(response.status)) {
					return response;
				}

				lastError = new Error(
					`HTTP ${response.status}: ${response.statusText}`
				);
			} catch (error) {
				lastError = error;
				log('warning', `Request attempt ${attempt} failed: ${error.message}`);
			}

			// Wait before retry (exponential backoff)
			if (attempt < this.retries) {
				const delay = this.retryDelay * Math.pow(2, attempt - 1);
				log('debug', `Retrying in ${delay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		throw lastError;
	}

	/**
	 * Check if HTTP status code is retryable
	 * @param {number} status - HTTP status code
	 * @returns {boolean} Whether the error is retryable
	 * @private
	 */
	_isRetryableError(status) {
		// Retry on server errors and rate limiting
		return status >= 500 || status === 429 || status === 408;
	}
}

/**
 * Codegen Task - mimics the Python SDK Task class
 */
export class CodegenTask {
	constructor(id, agent, initialData = {}) {
		this.id = id;
		this.agent = agent;
		this.status = initialData.status || 'pending';
		this.result = initialData.result || null;
		this.error = initialData.error || null;
		this.createdAt = initialData.created_at || new Date();
		this.updatedAt = initialData.updated_at || new Date();
		this._rawData = initialData;
	}

	/**
	 * Refresh task status from API
	 * @returns {Promise<void>}
	 */
	async refresh() {
		try {
			log('debug', `Refreshing task ${this.id} status`);

			const taskData = await this.agent.getTask(this.id);

			// Update task properties
			this.status = taskData.status;
			this.result = taskData.result;
			this.error = taskData.error;
			this.updatedAt = taskData.updated_at || new Date();
			this._rawData = taskData;

			log('debug', `Task ${this.id} status updated to: ${this.status}`);
		} catch (error) {
			log('error', `Failed to refresh task ${this.id}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Wait for task completion with polling
	 * @param {Object} options - Polling options
	 * @returns {Promise<Object>} Final result
	 */
	async waitForCompletion(options = {}) {
		const {
			pollInterval = 5000, // 5 seconds
			maxWaitTime = 600000, // 10 minutes
			onProgress = null
		} = options;

		const startTime = Date.now();

		while (this.status === 'pending' || this.status === 'running') {
			// Check timeout
			if (Date.now() - startTime > maxWaitTime) {
				throw new CodegenError(
					'TASK_TIMEOUT',
					`Task ${this.id} timed out after ${maxWaitTime}ms`
				);
			}

			// Wait before polling
			await new Promise((resolve) => setTimeout(resolve, pollInterval));

			// Refresh status
			await this.refresh();

			// Call progress callback if provided
			if (onProgress) {
				onProgress(this);
			}

			log('debug', `Task ${this.id} status: ${this.status}`);
		}

		if (this.status === 'completed') {
			return this.result;
		} else if (this.status === 'failed') {
			throw new CodegenError(
				'TASK_FAILED',
				this.error || 'Task failed without error message'
			);
		} else {
			throw new CodegenError(
				'TASK_UNKNOWN_STATUS',
				`Task ${this.id} ended with unknown status: ${this.status}`
			);
		}
	}

	/**
	 * Get task metadata
	 * @returns {Object} Task metadata
	 */
	getMetadata() {
		return {
			id: this.id,
			status: this.status,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
			hasResult: !!this.result,
			hasError: !!this.error
		};
	}
}

/**
 * Codegen Error class for better error handling
 */
export class CodegenError extends Error {
	constructor(code, message, originalError = null) {
		super(message);
		this.name = 'CodegenError';
		this.code = code;
		this.originalError = originalError;

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CodegenError);
		}
	}

	/**
	 * Check if error is retryable
	 * @returns {boolean} Whether the error should be retried
	 */
	isRetryable() {
		const retryableCodes = [
			'NETWORK_ERROR',
			'TIMEOUT_ERROR',
			'RATE_LIMIT_EXCEEDED',
			'SERVER_ERROR'
		];

		return retryableCodes.includes(this.code);
	}

	/**
	 * Get user-friendly error message
	 * @returns {string} User-friendly message
	 */
	getUserMessage() {
		const messageMap = {
			AUTHENTICATION_FAILED:
				'Invalid API credentials. Please check your token and org_id.',
			RATE_LIMIT_EXCEEDED: 'API rate limit exceeded. Please try again later.',
			TASK_CREATION_FAILED:
				'Failed to create task. Please check your prompt and try again.',
			TASK_FETCH_FAILED:
				'Failed to retrieve task status. The task may not exist.',
			TASK_TIMEOUT:
				'Task took too long to complete. Please try with a simpler request.',
			TASK_FAILED:
				'Task execution failed. Please check your prompt and try again.',
			INSUFFICIENT_CREDITS:
				'Insufficient Codegen credits. Please check your account.',
			REPOSITORY_ACCESS_DENIED: 'No access to the specified repository.',
			NETWORK_ERROR:
				'Network connection failed. Please check your internet connection.',
			SERVER_ERROR:
				'Codegen service is experiencing issues. Please try again later.'
		};

		return messageMap[this.code] || this.message;
	}
}

/**
 * Rate Limiter for API requests
 */
export class RateLimiter {
	constructor(config = {}) {
		this.requestsPerMinute = config.requestsPerMinute || 60;
		this.requestsPerHour = config.requestsPerHour || 1000;
		this.requests = [];
	}

	/**
	 * Acquire permission to make a request
	 * @returns {Promise<void>}
	 */
	async acquire() {
		const now = Date.now();

		// Clean old requests
		this.requests = this.requests.filter((time) => now - time < 3600000); // 1 hour

		// Check hourly limit
		if (this.requests.length >= this.requestsPerHour) {
			const oldestRequest = Math.min(...this.requests);
			const waitTime = 3600000 - (now - oldestRequest);

			log('warning', `Hourly rate limit reached. Waiting ${waitTime}ms`);
			await new Promise((resolve) => setTimeout(resolve, waitTime));
			return this.acquire();
		}

		// Check minute limit
		const recentRequests = this.requests.filter((time) => now - time < 60000); // 1 minute
		if (recentRequests.length >= this.requestsPerMinute) {
			const oldestRecentRequest = Math.min(...recentRequests);
			const waitTime = 60000 - (now - oldestRecentRequest);

			log('warning', `Per-minute rate limit reached. Waiting ${waitTime}ms`);
			await new Promise((resolve) => setTimeout(resolve, waitTime));
			return this.acquire();
		}

		// Record this request
		this.requests.push(now);
	}

	/**
	 * Get current rate limit status
	 * @returns {Object} Rate limit status
	 */
	getStatus() {
		const now = Date.now();
		const recentRequests = this.requests.filter((time) => now - time < 60000);
		const hourlyRequests = this.requests.filter((time) => now - time < 3600000);

		return {
			requestsThisMinute: recentRequests.length,
			requestsThisHour: hourlyRequests.length,
			minuteLimit: this.requestsPerMinute,
			hourlyLimit: this.requestsPerHour,
			canMakeRequest:
				recentRequests.length < this.requestsPerMinute &&
				hourlyRequests.length < this.requestsPerHour
		};
	}
}

export default CodegenAgent;
