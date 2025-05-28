/**
 * @fileoverview GitHub API Client
 * @description Wrapper for GitHub API interactions with rate limiting and error handling
 */

import axios from 'axios';
import { log } from '../../scripts/modules/utils.js';

/**
 * GitHub API client with rate limiting and error handling
 */
export class GitHubAPIClient {
    constructor(config = {}) {
        this.config = {
            baseURL: 'https://api.github.com',
            timeout: 30000,
            retries: 3,
            retryDelay: 1000,
            ...config
        };

        this.token = config.token || process.env.GITHUB_TOKEN;
        this.rateLimitRemaining = null;
        this.rateLimitReset = null;

        // Create axios instance
        this.client = axios.create({
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'claude-task-master-webhook-system',
                ...(this.token && { 'Authorization': `token ${this.token}` })
            }
        });

        // Add response interceptor for rate limit tracking
        this.client.interceptors.response.use(
            (response) => {
                this._updateRateLimitInfo(response.headers);
                return response;
            },
            (error) => {
                if (error.response) {
                    this._updateRateLimitInfo(error.response.headers);
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Get repository information
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Object>} Repository information
     */
    async getRepository(owner, repo) {
        try {
            const response = await this._makeRequest('GET', `/repos/${owner}/${repo}`);
            return response.data;
        } catch (error) {
            log('error', `Failed to get repository ${owner}/${repo}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get pull request information
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} pullNumber - Pull request number
     * @returns {Promise<Object>} Pull request information
     */
    async getPullRequest(owner, repo, pullNumber) {
        try {
            const response = await this._makeRequest('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}`);
            return response.data;
        } catch (error) {
            log('error', `Failed to get pull request ${owner}/${repo}#${pullNumber}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get pull request files
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} pullNumber - Pull request number
     * @returns {Promise<Array>} Pull request files
     */
    async getPullRequestFiles(owner, repo, pullNumber) {
        try {
            const response = await this._makeRequest('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}/files`);
            return response.data;
        } catch (error) {
            log('error', `Failed to get pull request files ${owner}/${repo}#${pullNumber}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a comment on a pull request
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} pullNumber - Pull request number
     * @param {string} body - Comment body
     * @returns {Promise<Object>} Created comment
     */
    async createPullRequestComment(owner, repo, pullNumber, body) {
        try {
            const response = await this._makeRequest('POST', `/repos/${owner}/${repo}/issues/${pullNumber}/comments`, {
                body
            });
            return response.data;
        } catch (error) {
            log('error', `Failed to create PR comment ${owner}/${repo}#${pullNumber}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update pull request status
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {string} sha - Commit SHA
     * @param {Object} status - Status object
     * @returns {Promise<Object>} Created status
     */
    async updateCommitStatus(owner, repo, sha, status) {
        try {
            const response = await this._makeRequest('POST', `/repos/${owner}/${repo}/statuses/${sha}`, status);
            return response.data;
        } catch (error) {
            log('error', `Failed to update commit status ${owner}/${repo}@${sha}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a check run
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {Object} checkRun - Check run object
     * @returns {Promise<Object>} Created check run
     */
    async createCheckRun(owner, repo, checkRun) {
        try {
            const response = await this._makeRequest('POST', `/repos/${owner}/${repo}/check-runs`, checkRun);
            return response.data;
        } catch (error) {
            log('error', `Failed to create check run ${owner}/${repo}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update a check run
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} checkRunId - Check run ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated check run
     */
    async updateCheckRun(owner, repo, checkRunId, updates) {
        try {
            const response = await this._makeRequest('PATCH', `/repos/${owner}/${repo}/check-runs/${checkRunId}`, updates);
            return response.data;
        } catch (error) {
            log('error', `Failed to update check run ${owner}/${repo}#${checkRunId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get issue information
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} issueNumber - Issue number
     * @returns {Promise<Object>} Issue information
     */
    async getIssue(owner, repo, issueNumber) {
        try {
            const response = await this._makeRequest('GET', `/repos/${owner}/${repo}/issues/${issueNumber}`);
            return response.data;
        } catch (error) {
            log('error', `Failed to get issue ${owner}/${repo}#${issueNumber}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a comment on an issue
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} issueNumber - Issue number
     * @param {string} body - Comment body
     * @returns {Promise<Object>} Created comment
     */
    async createIssueComment(owner, repo, issueNumber, body) {
        try {
            const response = await this._makeRequest('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
                body
            });
            return response.data;
        } catch (error) {
            log('error', `Failed to create issue comment ${owner}/${repo}#${issueNumber}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get workflow run information
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} runId - Workflow run ID
     * @returns {Promise<Object>} Workflow run information
     */
    async getWorkflowRun(owner, repo, runId) {
        try {
            const response = await this._makeRequest('GET', `/repos/${owner}/${repo}/actions/runs/${runId}`);
            return response.data;
        } catch (error) {
            log('error', `Failed to get workflow run ${owner}/${repo}#${runId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get workflow run jobs
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} runId - Workflow run ID
     * @returns {Promise<Array>} Workflow run jobs
     */
    async getWorkflowRunJobs(owner, repo, runId) {
        try {
            const response = await this._makeRequest('GET', `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
            return response.data.jobs;
        } catch (error) {
            log('error', `Failed to get workflow run jobs ${owner}/${repo}#${runId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get rate limit status
     * @returns {Promise<Object>} Rate limit information
     */
    async getRateLimit() {
        try {
            const response = await this._makeRequest('GET', '/rate_limit');
            return response.data;
        } catch (error) {
            log('error', `Failed to get rate limit: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if rate limit allows request
     * @returns {boolean} Whether request is allowed
     */
    canMakeRequest() {
        if (this.rateLimitRemaining === null) {
            return true; // Unknown state, allow request
        }

        if (this.rateLimitRemaining <= 0) {
            const now = Math.floor(Date.now() / 1000);
            return now >= this.rateLimitReset;
        }

        return true;
    }

    /**
     * Get time until rate limit reset
     * @returns {number} Seconds until reset
     */
    getTimeUntilReset() {
        if (this.rateLimitReset === null) {
            return 0;
        }

        const now = Math.floor(Date.now() / 1000);
        return Math.max(0, this.rateLimitReset - now);
    }

    /**
     * Make HTTP request with retry logic
     * @param {string} method - HTTP method
     * @param {string} url - Request URL
     * @param {Object} data - Request data
     * @returns {Promise<Object>} Response
     * @private
     */
    async _makeRequest(method, url, data = null) {
        let lastError;

        for (let attempt = 1; attempt <= this.config.retries; attempt++) {
            try {
                // Check rate limit before making request
                if (!this.canMakeRequest()) {
                    const waitTime = this.getTimeUntilReset();
                    if (waitTime > 0) {
                        log('warn', `Rate limit exceeded, waiting ${waitTime} seconds`);
                        await this._sleep(waitTime * 1000);
                    }
                }

                const config = {
                    method,
                    url,
                    ...(data && { data })
                };

                const response = await this.client.request(config);
                return response;

            } catch (error) {
                lastError = error;

                // Don't retry on authentication errors or client errors (4xx except 429)
                if (error.response) {
                    const status = error.response.status;
                    if (status === 401 || status === 403 || (status >= 400 && status < 500 && status !== 429)) {
                        throw error;
                    }

                    // Handle rate limiting
                    if (status === 429) {
                        const retryAfter = error.response.headers['retry-after'];
                        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.config.retryDelay * attempt;
                        log('warn', `Rate limited, waiting ${waitTime}ms before retry ${attempt}/${this.config.retries}`);
                        await this._sleep(waitTime);
                        continue;
                    }
                }

                // Wait before retry for other errors
                if (attempt < this.config.retries) {
                    const waitTime = this.config.retryDelay * Math.pow(2, attempt - 1);
                    log('warn', `Request failed, retrying in ${waitTime}ms (attempt ${attempt}/${this.config.retries})`);
                    await this._sleep(waitTime);
                }
            }
        }

        throw lastError;
    }

    /**
     * Update rate limit information from response headers
     * @param {Object} headers - Response headers
     * @private
     */
    _updateRateLimitInfo(headers) {
        if (headers['x-ratelimit-remaining']) {
            this.rateLimitRemaining = parseInt(headers['x-ratelimit-remaining']);
        }
        if (headers['x-ratelimit-reset']) {
            this.rateLimitReset = parseInt(headers['x-ratelimit-reset']);
        }
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create GitHub API client with authentication
     * @param {string} token - GitHub token
     * @param {Object} config - Additional configuration
     * @returns {GitHubAPIClient} Configured client
     */
    static createAuthenticatedClient(token, config = {}) {
        return new GitHubAPIClient({
            token,
            ...config
        });
    }

    /**
     * Create GitHub API client for webhook processing
     * @param {Object} config - Configuration
     * @returns {GitHubAPIClient} Configured client
     */
    static createWebhookClient(config = {}) {
        return new GitHubAPIClient({
            timeout: 10000, // Shorter timeout for webhook responses
            retries: 2,     // Fewer retries for webhook processing
            ...config
        });
    }
}

export default GitHubAPIClient;

