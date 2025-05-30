/**
 * @fileoverview GitHub Integration
 * @description Comprehensive GitHub API integration for repository management and PR operations
 */

import EventEmitter from 'events';
import { integrationConfig } from '../config/integrations.js';

/**
 * GitHub Integration Service
 * Handles all GitHub API operations and webhook processing
 */
export class GitHubIntegration extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.github,
            ...config
        };
        
        this.token = this.config.token;
        this.baseUrl = this.config.baseUrl;
        this.webhookSecret = this.config.webhookSecret;
        
        // Rate limiting
        this.rateLimiter = {
            requests: 0,
            windowStart: Date.now(),
            maxRequests: this.config.rateLimits.requests,
            windowMs: this.config.rateLimits.window * 1000
        };
        
        // Circuit breaker state
        this.circuitBreaker = {
            failures: 0,
            lastFailure: null,
            state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
        };
        
        this.isInitialized = false;
        this.metrics = {
            requestCount: 0,
            errorCount: 0,
            lastRequest: null,
            averageResponseTime: 0
        };
    }
    
    /**
     * Initialize the GitHub integration
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Validate token and connection
            await this.validateConnection();
            this.isInitialized = true;
            this.emit('initialized');
            console.log('GitHub integration initialized successfully');
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize GitHub integration: ${error.message}`);
        }
    }
    
    /**
     * Validate connection to GitHub API
     */
    async validateConnection() {
        try {
            const response = await this.makeRequest('GET', '/user');
            if (!response.login) {
                throw new Error('Invalid API response');
            }
            return true;
        } catch (error) {
            throw new Error(`GitHub connection validation failed: ${error.message}`);
        }
    }
    
    /**
     * Validate repository URL and access
     */
    async validateRepository(repoUrl) {
        try {
            const { owner, repo } = this.parseRepoUrl(repoUrl);
            
            const response = await this.makeRequest('GET', `/repos/${owner}/${repo}`);
            
            if (!response.id) {
                throw new Error('Repository not found or access denied');
            }
            
            this.emit('repository.validated', { owner, repo, repository: response });
            
            return {
                valid: true,
                repository: response,
                permissions: {
                    admin: response.permissions?.admin || false,
                    push: response.permissions?.push || false,
                    pull: response.permissions?.pull || false
                }
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Repository validation failed: ${error.message}`);
        }
    }
    
    /**
     * Create a pull request
     */
    async createPullRequest(repoUrl, branch, title, body, baseBranch = 'main') {
        try {
            const { owner, repo } = this.parseRepoUrl(repoUrl);
            
            const prData = {
                title,
                body,
                head: branch,
                base: baseBranch,
                draft: false
            };
            
            const response = await this.makeRequest('POST', `/repos/${owner}/${repo}/pulls`, prData);
            
            if (!response.id) {
                throw new Error('Failed to create pull request');
            }
            
            this.emit('pr.created', { 
                pullRequest: response, 
                repository: { owner, repo },
                branch,
                baseBranch
            });
            
            return {
                id: response.id,
                number: response.number,
                url: response.html_url,
                apiUrl: response.url,
                title: response.title,
                body: response.body,
                state: response.state,
                head: {
                    ref: response.head.ref,
                    sha: response.head.sha
                },
                base: {
                    ref: response.base.ref,
                    sha: response.base.sha
                },
                createdAt: response.created_at,
                updatedAt: response.updated_at
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to create pull request: ${error.message}`);
        }
    }
    
    /**
     * Link PR to Linear issue
     */
    async linkPRToIssue(prUrl, issueUrl) {
        try {
            const { owner, repo, number } = this.parsePRUrl(prUrl);
            
            // Get current PR body
            const pr = await this.getPRDetails(prUrl);
            
            // Add issue link to PR body
            const issueLink = `\\n\\n**Related Linear Issue:** ${issueUrl}`;
            const updatedBody = pr.body + issueLink;
            
            const response = await this.makeRequest('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, {
                body: updatedBody
            });
            
            this.emit('pr.issue.linked', { prUrl, issueUrl, pullRequest: response });
            
            return response;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to link PR to issue: ${error.message}`);
        }
    }
    
    /**
     * Get PR status and details
     */
    async getPRStatus(prUrl) {
        try {
            const pr = await this.getPRDetails(prUrl);
            const { owner, repo, number } = this.parsePRUrl(prUrl);
            
            // Get PR checks
            const checks = await this.makeRequest('GET', `/repos/${owner}/${repo}/pulls/${number}/checks`);
            
            // Get PR reviews
            const reviews = await this.makeRequest('GET', `/repos/${owner}/${repo}/pulls/${number}/reviews`);
            
            const status = {
                state: pr.state,
                mergeable: pr.mergeable,
                merged: pr.merged,
                draft: pr.draft,
                checks: {
                    total: checks.total_count || 0,
                    pending: checks.check_runs?.filter(c => c.status === 'in_progress').length || 0,
                    success: checks.check_runs?.filter(c => c.conclusion === 'success').length || 0,
                    failure: checks.check_runs?.filter(c => c.conclusion === 'failure').length || 0
                },
                reviews: {
                    total: reviews.length || 0,
                    approved: reviews.filter(r => r.state === 'APPROVED').length || 0,
                    changesRequested: reviews.filter(r => r.state === 'CHANGES_REQUESTED').length || 0,
                    pending: reviews.filter(r => r.state === 'PENDING').length || 0
                },
                lastUpdated: pr.updated_at
            };
            
            this.emit('pr.status.checked', { prUrl, status });
            
            return status;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get PR status: ${error.message}`);
        }
    }
    
    /**
     * Get PR details
     */
    async getPRDetails(prUrl) {
        try {
            const { owner, repo, number } = this.parsePRUrl(prUrl);
            
            const response = await this.makeRequest('GET', `/repos/${owner}/${repo}/pulls/${number}`);
            
            if (!response.id) {
                throw new Error('Pull request not found');
            }
            
            return response;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get PR details: ${error.message}`);
        }
    }
    
    /**
     * Merge pull request
     */
    async mergePullRequest(prUrl, mergeMethod = 'merge') {
        try {
            const { owner, repo, number } = this.parsePRUrl(prUrl);
            
            // Check if PR is mergeable
            const status = await this.getPRStatus(prUrl);
            
            if (status.state !== 'open') {
                throw new Error(`Cannot merge PR in state: ${status.state}`);
            }
            
            if (!status.mergeable) {
                throw new Error('PR is not mergeable (conflicts or checks failing)');
            }
            
            const mergeData = {
                commit_title: `Merge pull request #${number}`,
                merge_method: mergeMethod // merge, squash, rebase
            };
            
            const response = await this.makeRequest('PUT', `/repos/${owner}/${repo}/pulls/${number}/merge`, mergeData);
            
            if (!response.merged) {
                throw new Error(response.message || 'Failed to merge pull request');
            }
            
            this.emit('pr.merged', { 
                prUrl, 
                mergeResult: response,
                mergeMethod,
                sha: response.sha
            });
            
            return {
                merged: true,
                sha: response.sha,
                message: response.message
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to merge pull request: ${error.message}`);
        }
    }
    
    /**
     * Clone repository
     */
    async cloneRepository(repoUrl, branch = 'main') {
        try {
            const { owner, repo } = this.parseRepoUrl(repoUrl);
            
            // Validate repository access first
            await this.validateRepository(repoUrl);
            
            // Get repository details
            const repoDetails = await this.makeRequest('GET', `/repos/${owner}/${repo}`);
            
            const cloneInfo = {
                cloneUrl: repoDetails.clone_url,
                sshUrl: repoDetails.ssh_url,
                httpsUrl: repoDetails.clone_url,
                defaultBranch: repoDetails.default_branch,
                targetBranch: branch,
                size: repoDetails.size,
                language: repoDetails.language
            };
            
            this.emit('repository.clone.prepared', { 
                repository: { owner, repo },
                cloneInfo,
                branch
            });
            
            return cloneInfo;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to prepare repository clone: ${error.message}`);
        }
    }
    
    /**
     * Handle GitHub webhooks
     */
    async handleGitHubWebhooks(payload) {
        try {
            const eventType = payload.headers?.['x-github-event'] || payload.event;
            const data = payload.body || payload;
            
            switch (eventType) {
                case 'pull_request':
                    await this.handlePullRequestWebhook(data);
                    break;
                case 'push':
                    await this.handlePushWebhook(data);
                    break;
                case 'issues':
                    await this.handleIssuesWebhook(data);
                    break;
                case 'repository':
                    await this.handleRepositoryWebhook(data);
                    break;
                case 'check_run':
                    await this.handleCheckRunWebhook(data);
                    break;
                case 'check_suite':
                    await this.handleCheckSuiteWebhook(data);
                    break;
                default:
                    console.log(`Unhandled GitHub webhook event: ${eventType}`);
            }
            
            this.emit('webhook.processed', { eventType, data });
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to handle GitHub webhook: ${error.message}`);
        }
    }
    
    /**
     * Handle pull request webhook events
     */
    async handlePullRequestWebhook(data) {
        const { action, pull_request, repository } = data;
        
        switch (action) {
            case 'opened':
                this.emit('pr.opened', { pullRequest: pull_request, repository });
                break;
            case 'closed':
                if (pull_request.merged) {
                    this.emit('pr.merged', { pullRequest: pull_request, repository });
                } else {
                    this.emit('pr.closed', { pullRequest: pull_request, repository });
                }
                break;
            case 'synchronize':
                this.emit('pr.updated', { pullRequest: pull_request, repository });
                break;
            case 'review_requested':
                this.emit('pr.review.requested', { pullRequest: pull_request, repository });
                break;
            default:
                console.log(`Unhandled PR action: ${action}`);
        }
    }
    
    /**
     * Handle push webhook events
     */
    async handlePushWebhook(data) {
        const { ref, commits, repository, pusher } = data;
        
        this.emit('push', { 
            ref, 
            commits, 
            repository, 
            pusher,
            branch: ref.replace('refs/heads/', '')
        });
    }
    
    /**
     * Handle issues webhook events
     */
    async handleIssuesWebhook(data) {
        const { action, issue, repository } = data;
        
        switch (action) {
            case 'opened':
                this.emit('issue.opened', { issue, repository });
                break;
            case 'closed':
                this.emit('issue.closed', { issue, repository });
                break;
            case 'edited':
                this.emit('issue.edited', { issue, repository });
                break;
            default:
                console.log(`Unhandled issue action: ${action}`);
        }
    }
    
    /**
     * Handle repository webhook events
     */
    async handleRepositoryWebhook(data) {
        const { action, repository } = data;
        
        switch (action) {
            case 'created':
                this.emit('repository.created', { repository });
                break;
            case 'deleted':
                this.emit('repository.deleted', { repository });
                break;
            case 'archived':
                this.emit('repository.archived', { repository });
                break;
            default:
                console.log(`Unhandled repository action: ${action}`);
        }
    }
    
    /**
     * Handle check run webhook events
     */
    async handleCheckRunWebhook(data) {
        const { action, check_run, repository } = data;
        
        switch (action) {
            case 'created':
                this.emit('check.run.created', { checkRun: check_run, repository });
                break;
            case 'completed':
                this.emit('check.run.completed', { checkRun: check_run, repository });
                break;
            default:
                console.log(`Unhandled check run action: ${action}`);
        }
    }
    
    /**
     * Handle check suite webhook events
     */
    async handleCheckSuiteWebhook(data) {
        const { action, check_suite, repository } = data;
        
        switch (action) {
            case 'completed':
                this.emit('check.suite.completed', { checkSuite: check_suite, repository });
                break;
            case 'requested':
                this.emit('check.suite.requested', { checkSuite: check_suite, repository });
                break;
            default:
                console.log(`Unhandled check suite action: ${action}`);
        }
    }
    
    /**
     * Parse repository URL
     */
    parseRepoUrl(repoUrl) {
        try {
            // Handle different URL formats
            let cleanUrl = repoUrl;
            
            if (repoUrl.startsWith('https://github.com/')) {
                cleanUrl = repoUrl.replace('https://github.com/', '');
            } else if (repoUrl.startsWith('git@github.com:')) {
                cleanUrl = repoUrl.replace('git@github.com:', '').replace('.git', '');
            }
            
            const parts = cleanUrl.split('/');
            if (parts.length < 2) {
                throw new Error('Invalid repository URL format');
            }
            
            return {
                owner: parts[0],
                repo: parts[1].replace('.git', '')
            };
        } catch (error) {
            throw new Error(`Failed to parse repository URL: ${error.message}`);
        }
    }
    
    /**
     * Parse PR URL
     */
    parsePRUrl(prUrl) {
        try {
            const url = new URL(prUrl);
            const pathParts = url.pathname.split('/');
            
            if (pathParts.length < 5 || pathParts[3] !== 'pull') {
                throw new Error('Invalid PR URL format');
            }
            
            return {
                owner: pathParts[1],
                repo: pathParts[2],
                number: parseInt(pathParts[4])
            };
        } catch (error) {
            throw new Error(`Failed to parse PR URL: ${error.message}`);
        }
    }
    
    /**
     * Make HTTP request to GitHub API
     */
    async makeRequest(method, endpoint, data = null) {
        // Check circuit breaker
        if (this.circuitBreaker.state === 'OPEN') {
            const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
            if (timeSinceLastFailure < 60000) { // 1 minute
                throw new Error('Circuit breaker is OPEN');
            } else {
                this.circuitBreaker.state = 'HALF_OPEN';
            }
        }
        
        // Check rate limits
        await this.checkRateLimit();
        
        const startTime = Date.now();
        
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const options = {
                method,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'claude-task-master/1.0.0'
                }
            };
            
            if (data) {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(url, options);
            
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorBody}`);
            }
            
            const result = await response.json();
            
            // Update metrics
            const responseTime = Date.now() - startTime;
            this.updateMetrics(responseTime, false);
            
            // Reset circuit breaker on success
            if (this.circuitBreaker.state === 'HALF_OPEN') {
                this.circuitBreaker.state = 'CLOSED';
                this.circuitBreaker.failures = 0;
            }
            
            return result;
        } catch (error) {
            // Update metrics
            this.updateMetrics(Date.now() - startTime, true);
            
            // Update circuit breaker
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailure = Date.now();
            
            if (this.circuitBreaker.failures >= 5) {
                this.circuitBreaker.state = 'OPEN';
            }
            
            throw error;
        }
    }
    
    /**
     * Check rate limits
     */
    async checkRateLimit() {
        const now = Date.now();
        const windowElapsed = now - this.rateLimiter.windowStart;
        
        if (windowElapsed >= this.rateLimiter.windowMs) {
            // Reset window
            this.rateLimiter.requests = 0;
            this.rateLimiter.windowStart = now;
        }
        
        if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
            const waitTime = this.rateLimiter.windowMs - windowElapsed;
            throw new Error(`Rate limit exceeded. Wait ${waitTime}ms`);
        }
        
        this.rateLimiter.requests++;
    }
    
    /**
     * Update metrics
     */
    updateMetrics(responseTime, isError) {
        this.metrics.requestCount++;
        this.metrics.lastRequest = Date.now();
        
        if (isError) {
            this.metrics.errorCount++;
        }
        
        // Calculate rolling average response time
        this.metrics.averageResponseTime = 
            (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + responseTime) / 
            this.metrics.requestCount;
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        const errorRate = this.metrics.requestCount > 0 ? 
            (this.metrics.errorCount / this.metrics.requestCount) * 100 : 0;
        
        return {
            service: 'github',
            status: this.circuitBreaker.state === 'OPEN' ? 'unhealthy' : 'healthy',
            initialized: this.isInitialized,
            circuitBreaker: this.circuitBreaker.state,
            metrics: {
                ...this.metrics,
                errorRate: Math.round(errorRate * 100) / 100
            },
            rateLimiter: {
                requests: this.rateLimiter.requests,
                maxRequests: this.rateLimiter.maxRequests,
                windowStart: this.rateLimiter.windowStart
            }
        };
    }
}

export default GitHubIntegration;

