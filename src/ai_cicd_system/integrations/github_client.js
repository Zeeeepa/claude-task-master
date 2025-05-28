/**
 * @fileoverview GitHub API Client
 * @description Client for interacting with GitHub API
 */

import { log } from '../utils/simple_logger.js';

/**
 * GitHub API client for repository and PR operations
 */
export class GitHubClient {
    constructor(config = {}) {
        this.config = {
            token: config.token || process.env.GITHUB_TOKEN,
            base_url: config.base_url || 'https://api.github.com',
            user_agent: config.user_agent || 'claude-task-master/1.0.0',
            timeout: config.timeout || 30000,
            max_retries: config.max_retries || 3,
            retry_delay: config.retry_delay || 1000,
            ...config
        };

        if (!this.config.token) {
            log('warn', 'GitHub token not provided - some operations may fail');
        }

        // Rate limiting tracking
        this.rateLimitRemaining = 5000;
        this.rateLimitReset = Date.now();
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }

    /**
     * Make authenticated request to GitHub API
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Object>} API response
     */
    async makeRequest(endpoint, options = {}) {
        const url = `${this.config.base_url}${endpoint}`;
        const requestOptions = {
            method: options.method || 'GET',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': this.config.user_agent,
                ...options.headers
            },
            timeout: this.config.timeout,
            ...options
        };

        // Add authorization header if token is available
        if (this.config.token) {
            requestOptions.headers['Authorization'] = `token ${this.config.token}`;
        }

        // Add body for POST/PUT requests
        if (options.body && typeof options.body === 'object') {
            requestOptions.body = JSON.stringify(options.body);
            requestOptions.headers['Content-Type'] = 'application/json';
        }

        try {
            log('debug', `GitHub API request: ${requestOptions.method} ${url}`);
            
            // Check rate limiting
            await this.checkRateLimit();

            const response = await fetch(url, requestOptions);
            
            // Update rate limit info from headers
            this.updateRateLimitInfo(response.headers);

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const data = await response.json();
            log('debug', `GitHub API response: ${response.status}`);
            
            return data;

        } catch (error) {
            log('error', `GitHub API request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get repository information
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Object>} Repository data
     */
    async getRepository(owner, repo) {
        return await this.makeRequest(`/repos/${owner}/${repo}`);
    }

    /**
     * Get pull request information
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} prNumber - Pull request number
     * @returns {Promise<Object>} Pull request data
     */
    async getPullRequest(owner, repo, prNumber) {
        return await this.makeRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`);
    }

    /**
     * Get pull request files
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} prNumber - Pull request number
     * @returns {Promise<Array>} Array of changed files
     */
    async getPullRequestFiles(owner, repo, prNumber) {
        return await this.makeRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
    }

    /**
     * Get pull request commits
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} prNumber - Pull request number
     * @returns {Promise<Array>} Array of commits
     */
    async getPullRequestCommits(owner, repo, prNumber) {
        return await this.makeRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/commits`);
    }

    /**
     * Create a comment on a pull request
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} prNumber - Pull request number
     * @param {string} body - Comment body
     * @returns {Promise<Object>} Created comment
     */
    async createPullRequestComment(owner, repo, prNumber, body) {
        return await this.makeRequest(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
            method: 'POST',
            body: { body }
        });
    }

    /**
     * Create a review comment on a pull request
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} prNumber - Pull request number
     * @param {Object} comment - Review comment data
     * @returns {Promise<Object>} Created review comment
     */
    async createPullRequestReviewComment(owner, repo, prNumber, comment) {
        return await this.makeRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
            method: 'POST',
            body: comment
        });
    }

    /**
     * Create a pull request review
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} prNumber - Pull request number
     * @param {Object} review - Review data
     * @returns {Promise<Object>} Created review
     */
    async createPullRequestReview(owner, repo, prNumber, review) {
        return await this.makeRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
            method: 'POST',
            body: review
        });
    }

    /**
     * Get repository branches
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Array>} Array of branches
     */
    async getBranches(owner, repo) {
        return await this.makeRequest(`/repos/${owner}/${repo}/branches`);
    }

    /**
     * Get branch protection rules
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {string} branch - Branch name
     * @returns {Promise<Object>} Branch protection data
     */
    async getBranchProtection(owner, repo, branch) {
        try {
            return await this.makeRequest(`/repos/${owner}/${repo}/branches/${branch}/protection`);
        } catch (error) {
            if (error.message.includes('404')) {
                return null; // No protection rules
            }
            throw error;
        }
    }

    /**
     * Get repository webhooks
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Array>} Array of webhooks
     */
    async getWebhooks(owner, repo) {
        return await this.makeRequest(`/repos/${owner}/${repo}/hooks`);
    }

    /**
     * Create a webhook
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {Object} webhook - Webhook configuration
     * @returns {Promise<Object>} Created webhook
     */
    async createWebhook(owner, repo, webhook) {
        return await this.makeRequest(`/repos/${owner}/${repo}/hooks`, {
            method: 'POST',
            body: webhook
        });
    }

    /**
     * Update a webhook
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} hookId - Webhook ID
     * @param {Object} webhook - Webhook configuration
     * @returns {Promise<Object>} Updated webhook
     */
    async updateWebhook(owner, repo, hookId, webhook) {
        return await this.makeRequest(`/repos/${owner}/${repo}/hooks/${hookId}`, {
            method: 'PATCH',
            body: webhook
        });
    }

    /**
     * Delete a webhook
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} hookId - Webhook ID
     * @returns {Promise<void>}
     */
    async deleteWebhook(owner, repo, hookId) {
        await this.makeRequest(`/repos/${owner}/${repo}/hooks/${hookId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Get file content from repository
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {string} path - File path
     * @param {string} ref - Git reference (branch, tag, or commit)
     * @returns {Promise<Object>} File content data
     */
    async getFileContent(owner, repo, path, ref = 'main') {
        return await this.makeRequest(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`);
    }

    /**
     * Search repositories
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchRepositories(query, options = {}) {
        const params = new URLSearchParams({
            q: query,
            sort: options.sort || 'updated',
            order: options.order || 'desc',
            per_page: options.per_page || 30,
            page: options.page || 1
        });

        return await this.makeRequest(`/search/repositories?${params}`);
    }

    /**
     * Get user information
     * @param {string} username - Username (optional, defaults to authenticated user)
     * @returns {Promise<Object>} User data
     */
    async getUser(username = null) {
        const endpoint = username ? `/users/${username}` : '/user';
        return await this.makeRequest(endpoint);
    }

    /**
     * Get organization information
     * @param {string} org - Organization name
     * @returns {Promise<Object>} Organization data
     */
    async getOrganization(org) {
        return await this.makeRequest(`/orgs/${org}`);
    }

    /**
     * Check rate limiting and wait if necessary
     */
    async checkRateLimit() {
        const now = Date.now();
        
        // If we have remaining requests or reset time has passed, proceed
        if (this.rateLimitRemaining > 0 || now > this.rateLimitReset) {
            return;
        }

        // Calculate wait time
        const waitTime = this.rateLimitReset - now;
        log('warn', `Rate limit exceeded, waiting ${waitTime}ms`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    /**
     * Update rate limit information from response headers
     * @param {Headers} headers - Response headers
     */
    updateRateLimitInfo(headers) {
        const remaining = headers.get('x-ratelimit-remaining');
        const reset = headers.get('x-ratelimit-reset');

        if (remaining !== null) {
            this.rateLimitRemaining = parseInt(remaining, 10);
        }

        if (reset !== null) {
            this.rateLimitReset = parseInt(reset, 10) * 1000; // Convert to milliseconds
        }
    }

    /**
     * Parse repository URL to extract owner and repo
     * @param {string} url - Repository URL
     * @returns {Object} Parsed owner and repo
     */
    static parseRepositoryUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part);
            
            if (pathParts.length >= 2) {
                return {
                    owner: pathParts[0],
                    repo: pathParts[1].replace(/\.git$/, '') // Remove .git suffix if present
                };
            }
            
            throw new Error('Invalid repository URL format');
        } catch (error) {
            throw new Error(`Failed to parse repository URL: ${error.message}`);
        }
    }

    /**
     * Get rate limit status
     * @returns {Promise<Object>} Rate limit information
     */
    async getRateLimit() {
        return await this.makeRequest('/rate_limit');
    }

    /**
     * Get client health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            has_token: !!this.config.token,
            rate_limit: {
                remaining: this.rateLimitRemaining,
                reset_at: new Date(this.rateLimitReset).toISOString()
            },
            base_url: this.config.base_url
        };
    }

    /**
     * Get client statistics
     * @returns {Object} Client statistics
     */
    getStatistics() {
        return {
            rate_limit_remaining: this.rateLimitRemaining,
            rate_limit_reset: this.rateLimitReset,
            queue_size: this.requestQueue.length,
            is_processing_queue: this.isProcessingQueue,
            config: {
                base_url: this.config.base_url,
                timeout: this.config.timeout,
                max_retries: this.config.max_retries
            }
        };
    }
}

export default GitHubClient;

