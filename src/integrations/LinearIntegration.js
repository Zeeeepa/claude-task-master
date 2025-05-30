/**
 * @fileoverview Linear Integration
 * @description Comprehensive Linear API integration for issue management and workflow synchronization
 */

import EventEmitter from 'events';
import { integrationConfig } from '../config/integrations.js';

/**
 * Linear Integration Service
 * Handles all Linear API operations and webhook processing
 */
export class LinearIntegration extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.linear,
            ...config
        };
        
        this.apiKey = this.config.apiKey;
        this.teamId = this.config.teamId;
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
     * Initialize the Linear integration
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Validate API key and connection
            await this.validateConnection();
            this.isInitialized = true;
            this.emit('initialized');
            console.log('Linear integration initialized successfully');
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize Linear integration: ${error.message}`);
        }
    }
    
    /**
     * Validate connection to Linear API
     */
    async validateConnection() {
        try {
            const response = await this.makeRequest('GET', '/viewer');
            if (!response.data?.viewer) {
                throw new Error('Invalid API response');
            }
            return true;
        } catch (error) {
            throw new Error(`Linear connection validation failed: ${error.message}`);
        }
    }
    
    /**
     * Create a new Linear issue
     */
    async createIssue(title, description, parentIssueId = null) {
        try {
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
                            team {
                                id
                                name
                                key
                            }
                            createdAt
                            updatedAt
                        }
                        error
                    }
                }
            `;
            
            const variables = {
                input: {
                    title,
                    description,
                    teamId: this.teamId,
                    ...(parentIssueId && { parentId: parentIssueId })
                }
            };
            
            const response = await this.makeRequest('POST', '', {
                query: mutation,
                variables
            });
            
            if (!response.data?.issueCreate?.success) {
                throw new Error(response.data?.issueCreate?.error || 'Failed to create issue');
            }
            
            const issue = response.data.issueCreate.issue;
            this.emit('issue.created', { issue });
            
            return issue;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to create Linear issue: ${error.message}`);
        }
    }
    
    /**
     * Create a sub-issue
     */
    async createSubIssue(parentIssueId, title, description) {
        return this.createIssue(title, description, parentIssueId);
    }
    
    /**
     * Update issue status
     */
    async updateIssueStatus(issueId, status) {
        try {
            // First, get available states for the team
            const states = await this.getTeamStates();
            const targetState = states.find(state => 
                state.name.toLowerCase() === status.toLowerCase() ||
                state.type.toLowerCase() === status.toLowerCase()
            );
            
            if (!targetState) {
                throw new Error(`Invalid status: ${status}. Available states: ${states.map(s => s.name).join(', ')}`);
            }
            
            const mutation = `
                mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
                    issueUpdate(id: $id, input: $input) {
                        success
                        issue {
                            id
                            identifier
                            state {
                                id
                                name
                                type
                            }
                            updatedAt
                        }
                        error
                    }
                }
            `;
            
            const variables = {
                id: issueId,
                input: {
                    stateId: targetState.id
                }
            };
            
            const response = await this.makeRequest('POST', '', {
                query: mutation,
                variables
            });
            
            if (!response.data?.issueUpdate?.success) {
                throw new Error(response.data?.issueUpdate?.error || 'Failed to update issue status');
            }
            
            const issue = response.data.issueUpdate.issue;
            this.emit('issue.status.updated', { issue, previousStatus: status, newStatus: targetState.name });
            
            return issue;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to update issue status: ${error.message}`);
        }
    }
    
    /**
     * Link issue to task
     */
    async linkIssueToTask(issueId, taskId) {
        try {
            const mutation = `
                mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
                    issueUpdate(id: $id, input: $input) {
                        success
                        issue {
                            id
                            identifier
                            description
                        }
                        error
                    }
                }
            `;
            
            // Get current issue to append task link to description
            const currentIssue = await this.getIssueDetails(issueId);
            const taskLink = `\\n\\n**Linked Task:** ${taskId}`;
            const updatedDescription = currentIssue.description + taskLink;
            
            const variables = {
                id: issueId,
                input: {
                    description: updatedDescription
                }
            };
            
            const response = await this.makeRequest('POST', '', {
                query: mutation,
                variables
            });
            
            if (!response.data?.issueUpdate?.success) {
                throw new Error(response.data?.issueUpdate?.error || 'Failed to link issue to task');
            }
            
            this.emit('issue.task.linked', { issueId, taskId });
            
            return response.data.issueUpdate.issue;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to link issue to task: ${error.message}`);
        }
    }
    
    /**
     * Sync task progress
     */
    async syncTaskProgress(taskId, progress) {
        try {
            // Find issues linked to this task
            const issues = await this.findIssuesByTask(taskId);
            
            for (const issue of issues) {
                // Update issue with progress information
                const progressComment = `**Task Progress Update:** ${progress.percentage}% complete\\n${progress.description || ''}`;
                await this.addComment(issue.id, progressComment);
                
                // Update status based on progress
                if (progress.percentage === 100) {
                    await this.updateIssueStatus(issue.id, 'Done');
                } else if (progress.percentage > 0) {
                    await this.updateIssueStatus(issue.id, 'In Progress');
                }
            }
            
            this.emit('task.progress.synced', { taskId, progress, issues });
            
            return { taskId, progress, updatedIssues: issues.length };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to sync task progress: ${error.message}`);
        }
    }
    
    /**
     * Get issue details
     */
    async getIssueDetails(issueId) {
        try {
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
                        team {
                            id
                            name
                            key
                        }
                        assignee {
                            id
                            name
                            email
                        }
                        parent {
                            id
                            identifier
                            title
                        }
                        children {
                            nodes {
                                id
                                identifier
                                title
                                state {
                                    name
                                    type
                                }
                            }
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
                        dueDate
                        estimate
                        priority
                    }
                }
            `;
            
            const variables = { id: issueId };
            
            const response = await this.makeRequest('POST', '', {
                query,
                variables
            });
            
            if (!response.data?.issue) {
                throw new Error('Issue not found');
            }
            
            return response.data.issue;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get issue details: ${error.message}`);
        }
    }
    
    /**
     * Add comment to issue
     */
    async addComment(issueId, body) {
        try {
            const mutation = `
                mutation CreateComment($input: CommentCreateInput!) {
                    commentCreate(input: $input) {
                        success
                        comment {
                            id
                            body
                            createdAt
                        }
                        error
                    }
                }
            `;
            
            const variables = {
                input: {
                    issueId,
                    body
                }
            };
            
            const response = await this.makeRequest('POST', '', {
                query: mutation,
                variables
            });
            
            if (!response.data?.commentCreate?.success) {
                throw new Error(response.data?.commentCreate?.error || 'Failed to create comment');
            }
            
            return response.data.commentCreate.comment;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to add comment: ${error.message}`);
        }
    }
    
    /**
     * Get team states
     */
    async getTeamStates() {
        try {
            const query = `
                query GetTeamStates($teamId: String!) {
                    team(id: $teamId) {
                        states {
                            nodes {
                                id
                                name
                                type
                                color
                                position
                            }
                        }
                    }
                }
            `;
            
            const variables = { teamId: this.teamId };
            
            const response = await this.makeRequest('POST', '', {
                query,
                variables
            });
            
            if (!response.data?.team?.states?.nodes) {
                throw new Error('Failed to get team states');
            }
            
            return response.data.team.states.nodes;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get team states: ${error.message}`);
        }
    }
    
    /**
     * Find issues by task ID
     */
    async findIssuesByTask(taskId) {
        try {
            const query = `
                query SearchIssues($filter: IssueFilter!) {
                    issues(filter: $filter) {
                        nodes {
                            id
                            identifier
                            title
                            description
                            state {
                                name
                                type
                            }
                        }
                    }
                }
            `;
            
            const variables = {
                filter: {
                    team: { id: { eq: this.teamId } },
                    description: { contains: taskId }
                }
            };
            
            const response = await this.makeRequest('POST', '', {
                query,
                variables
            });
            
            return response.data?.issues?.nodes || [];
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to find issues by task: ${error.message}`);
        }
    }
    
    /**
     * Handle Linear webhooks
     */
    async handleLinearWebhooks(payload) {
        try {
            const { type, data } = payload;
            
            switch (type) {
                case 'Issue':
                    await this.handleIssueWebhook(data);
                    break;
                case 'Comment':
                    await this.handleCommentWebhook(data);
                    break;
                case 'IssueLabel':
                    await this.handleIssueLabelWebhook(data);
                    break;
                default:
                    console.log(`Unhandled Linear webhook type: ${type}`);
            }
            
            this.emit('webhook.processed', { type, data });
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to handle Linear webhook: ${error.message}`);
        }
    }
    
    /**
     * Handle issue webhook events
     */
    async handleIssueWebhook(data) {
        const { action, issue } = data;
        
        switch (action) {
            case 'create':
                this.emit('issue.created', { issue });
                break;
            case 'update':
                this.emit('issue.updated', { issue });
                break;
            case 'remove':
                this.emit('issue.deleted', { issue });
                break;
            default:
                console.log(`Unhandled issue action: ${action}`);
        }
    }
    
    /**
     * Handle comment webhook events
     */
    async handleCommentWebhook(data) {
        const { action, comment } = data;
        
        switch (action) {
            case 'create':
                this.emit('comment.created', { comment });
                break;
            case 'update':
                this.emit('comment.updated', { comment });
                break;
            case 'remove':
                this.emit('comment.deleted', { comment });
                break;
            default:
                console.log(`Unhandled comment action: ${action}`);
        }
    }
    
    /**
     * Handle issue label webhook events
     */
    async handleIssueLabelWebhook(data) {
        const { action, issueLabel } = data;
        
        switch (action) {
            case 'create':
                this.emit('issue.label.added', { issueLabel });
                break;
            case 'remove':
                this.emit('issue.label.removed', { issueLabel });
                break;
            default:
                console.log(`Unhandled issue label action: ${action}`);
        }
    }
    
    /**
     * Make HTTP request to Linear API
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
            const url = endpoint ? `${this.baseUrl}${endpoint}` : `${this.baseUrl}/graphql`;
            const options = {
                method,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'claude-task-master/1.0.0'
                }
            };
            
            if (data) {
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
            service: 'linear',
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

export default LinearIntegration;

