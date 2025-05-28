/**
 * utils/linear-client.js
 * Comprehensive Linear API client with error handling and rate limiting
 */

import { createHash } from 'crypto';

/**
 * Linear API client for automated ticket management
 */
export class LinearClient {
	constructor(apiKey, options = {}) {
		if (!apiKey) {
			throw new Error('Linear API key is required');
		}

		this.apiKey = apiKey;
		this.baseUrl = options.baseUrl || 'https://api.linear.app/graphql';
		this.rateLimitThreshold = options.rateLimitThreshold || 0.8; // 80% of quota
		this.retryAttempts = options.retryAttempts || 3;
		this.retryDelay = options.retryDelay || 1000; // 1 second
		this.requestQueue = [];
		this.isProcessingQueue = false;
		this.rateLimitInfo = {
			remaining: null,
			resetTime: null,
			limit: null
		};
	}

	/**
	 * Make a GraphQL request to Linear API
	 * @param {string} query - GraphQL query
	 * @param {Object} variables - Query variables
	 * @returns {Promise<Object>} API response
	 */
	async makeRequest(query, variables = {}) {
		const requestData = {
			query,
			variables
		};

		return new Promise((resolve, reject) => {
			this.requestQueue.push({ requestData, resolve, reject });
			this.processQueue();
		});
	}

	/**
	 * Process the request queue with rate limiting
	 */
	async processQueue() {
		if (this.isProcessingQueue || this.requestQueue.length === 0) {
			return;
		}

		this.isProcessingQueue = true;

		while (this.requestQueue.length > 0) {
			// Check rate limit before processing
			if (this.shouldWaitForRateLimit()) {
				await this.waitForRateLimit();
			}

			const { requestData, resolve, reject } = this.requestQueue.shift();

			try {
				const response = await this.executeRequest(requestData);
				resolve(response);
			} catch (error) {
				reject(error);
			}

			// Small delay between requests to be respectful
			await this.delay(100);
		}

		this.isProcessingQueue = false;
	}

	/**
	 * Execute the actual HTTP request
	 * @param {Object} requestData - Request payload
	 * @returns {Promise<Object>} Response data
	 */
	async executeRequest(requestData) {
		let lastError;

		for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
			try {
				const response = await fetch(this.baseUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': this.apiKey,
						'User-Agent': 'claude-task-master/1.0.0'
					},
					body: JSON.stringify(requestData)
				});

				// Update rate limit info from headers
				this.updateRateLimitInfo(response.headers);

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`HTTP ${response.status}: ${errorText}`);
				}

				const data = await response.json();

				if (data.errors) {
					throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
				}

				return data.data;
			} catch (error) {
				lastError = error;

				// Don't retry on authentication or client errors
				if (error.message.includes('401') || error.message.includes('403')) {
					throw error;
				}

				// Wait before retry
				if (attempt < this.retryAttempts) {
					await this.delay(this.retryDelay * attempt);
				}
			}
		}

		throw lastError;
	}

	/**
	 * Update rate limit information from response headers
	 * @param {Headers} headers - Response headers
	 */
	updateRateLimitInfo(headers) {
		const remaining = headers.get('x-ratelimit-remaining');
		const limit = headers.get('x-ratelimit-limit');
		const resetTime = headers.get('x-ratelimit-reset');

		if (remaining !== null) this.rateLimitInfo.remaining = parseInt(remaining);
		if (limit !== null) this.rateLimitInfo.limit = parseInt(limit);
		if (resetTime !== null) this.rateLimitInfo.resetTime = parseInt(resetTime);
	}

	/**
	 * Check if we should wait for rate limit reset
	 * @returns {boolean} Whether to wait
	 */
	shouldWaitForRateLimit() {
		if (!this.rateLimitInfo.remaining || !this.rateLimitInfo.limit) {
			return false;
		}

		const usageRatio = (this.rateLimitInfo.limit - this.rateLimitInfo.remaining) / this.rateLimitInfo.limit;
		return usageRatio >= this.rateLimitThreshold;
	}

	/**
	 * Wait for rate limit reset
	 */
	async waitForRateLimit() {
		if (!this.rateLimitInfo.resetTime) {
			await this.delay(60000); // Wait 1 minute if no reset time
			return;
		}

		const now = Math.floor(Date.now() / 1000);
		const waitTime = Math.max(0, this.rateLimitInfo.resetTime - now) * 1000;
		
		if (waitTime > 0) {
			console.log(`Rate limit threshold reached. Waiting ${waitTime}ms for reset...`);
			await this.delay(waitTime);
		}
	}

	/**
	 * Utility delay function
	 * @param {number} ms - Milliseconds to delay
	 */
	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Create a new Linear issue
	 * @param {Object} taskData - Task data for issue creation
	 * @returns {Promise<Object>} Created issue data
	 */
	async createIssue(taskData) {
		const mutation = `
			mutation CreateIssue($input: IssueCreateInput!) {
				issueCreate(input: $input) {
					success
					issue {
						id
						identifier
						title
						description
						url
						state {
							id
							name
							type
						}
						assignee {
							id
							name
							email
						}
						team {
							id
							name
							key
						}
						labels {
							nodes {
								id
								name
								color
							}
						}
						createdAt
						updatedAt
					}
				}
			}
		`;

		const variables = {
			input: {
				title: taskData.title,
				description: taskData.description || '',
				teamId: taskData.teamId,
				assigneeId: taskData.assigneeId,
				stateId: taskData.stateId,
				priority: taskData.priority || 0,
				labelIds: taskData.labelIds || [],
				projectId: taskData.projectId,
				parentId: taskData.parentId
			}
		};

		const result = await this.makeRequest(mutation, variables);
		
		if (!result.issueCreate.success) {
			throw new Error('Failed to create Linear issue');
		}

		return result.issueCreate.issue;
	}

	/**
	 * Update an existing Linear issue
	 * @param {string} issueId - Issue ID to update
	 * @param {Object} updates - Updates to apply
	 * @returns {Promise<Object>} Updated issue data
	 */
	async updateIssue(issueId, updates) {
		const mutation = `
			mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
				issueUpdate(id: $id, input: $input) {
					success
					issue {
						id
						identifier
						title
						description
						url
						state {
							id
							name
							type
						}
						assignee {
							id
							name
							email
						}
						updatedAt
					}
				}
			}
		`;

		const variables = {
			id: issueId,
			input: updates
		};

		const result = await this.makeRequest(mutation, variables);
		
		if (!result.issueUpdate.success) {
			throw new Error('Failed to update Linear issue');
		}

		return result.issueUpdate.issue;
	}

	/**
	 * Add a comment to a Linear issue
	 * @param {string} issueId - Issue ID
	 * @param {string} comment - Comment text
	 * @returns {Promise<Object>} Created comment data
	 */
	async addComment(issueId, comment) {
		const mutation = `
			mutation CreateComment($input: CommentCreateInput!) {
				commentCreate(input: $input) {
					success
					comment {
						id
						body
						createdAt
						user {
							id
							name
						}
					}
				}
			}
		`;

		const variables = {
			input: {
				issueId: issueId,
				body: comment
			}
		};

		const result = await this.makeRequest(mutation, variables);
		
		if (!result.commentCreate.success) {
			throw new Error('Failed to add comment to Linear issue');
		}

		return result.commentCreate.comment;
	}

	/**
	 * Assign an issue to a user
	 * @param {string} issueId - Issue ID
	 * @param {string} assigneeId - User ID to assign
	 * @returns {Promise<Object>} Updated issue data
	 */
	async assignIssue(issueId, assigneeId) {
		return this.updateIssue(issueId, { assigneeId });
	}

	/**
	 * Close a Linear issue
	 * @param {string} issueId - Issue ID to close
	 * @param {string} stateId - State ID for closed state
	 * @returns {Promise<Object>} Updated issue data
	 */
	async closeIssue(issueId, stateId) {
		return this.updateIssue(issueId, { stateId });
	}

	/**
	 * Get issue details
	 * @param {string} issueId - Issue ID
	 * @returns {Promise<Object>} Issue data
	 */
	async getIssue(issueId) {
		const query = `
			query GetIssue($id: String!) {
				issue(id: $id) {
					id
					identifier
					title
					description
					url
					state {
						id
						name
						type
					}
					assignee {
						id
						name
						email
					}
					team {
						id
						name
						key
					}
					labels {
						nodes {
							id
							name
							color
						}
					}
					createdAt
					updatedAt
				}
			}
		`;

		const variables = { id: issueId };
		const result = await this.makeRequest(query, variables);
		return result.issue;
	}

	/**
	 * Get team information
	 * @param {string} teamId - Team ID
	 * @returns {Promise<Object>} Team data
	 */
	async getTeam(teamId) {
		const query = `
			query GetTeam($id: String!) {
				team(id: $id) {
					id
					name
					key
					states {
						nodes {
							id
							name
							type
							color
						}
					}
					labels {
						nodes {
							id
							name
							color
						}
					}
					members {
						nodes {
							id
							name
							email
						}
					}
				}
			}
		`;

		const variables = { id: teamId };
		const result = await this.makeRequest(query, variables);
		return result.team;
	}

	/**
	 * Search for issues
	 * @param {Object} filters - Search filters
	 * @returns {Promise<Array>} Array of issues
	 */
	async searchIssues(filters = {}) {
		const query = `
			query SearchIssues($filter: IssueFilter) {
				issues(filter: $filter) {
					nodes {
						id
						identifier
						title
						description
						url
						state {
							id
							name
							type
						}
						assignee {
							id
							name
							email
						}
						team {
							id
							name
							key
						}
						createdAt
						updatedAt
					}
				}
			}
		`;

		const variables = { filter: filters };
		const result = await this.makeRequest(query, variables);
		return result.issues.nodes;
	}

	/**
	 * Get rate limit status
	 * @returns {Object} Rate limit information
	 */
	getRateLimitStatus() {
		return {
			...this.rateLimitInfo,
			usagePercentage: this.rateLimitInfo.limit 
				? ((this.rateLimitInfo.limit - this.rateLimitInfo.remaining) / this.rateLimitInfo.limit) * 100
				: 0
		};
	}

	/**
	 * Generate a unique external ID for task tracking
	 * @param {string} taskId - Task ID
	 * @param {string} source - Source identifier
	 * @returns {string} Unique external ID
	 */
	generateExternalId(taskId, source = 'claude-task-master') {
		const data = `${source}:${taskId}:${Date.now()}`;
		return createHash('sha256').update(data).digest('hex').substring(0, 16);
	}
}

export default LinearClient;

