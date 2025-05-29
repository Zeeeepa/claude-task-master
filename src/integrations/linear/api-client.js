/**
 * Linear API Client
 * 
 * Provides comprehensive Linear GraphQL API integration with authentication,
 * rate limiting, error handling, and query/mutation operations.
 */

import { LinearClient } from '@linear/sdk';
import { GraphQLClient } from 'graphql-request';

export class LinearAPIClient {
    constructor(config = {}) {
        this.config = {
            apiKey: config.apiKey || process.env.LINEAR_API_KEY,
            baseUrl: config.baseUrl || 'https://api.linear.app/graphql',
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            rateLimitBuffer: config.rateLimitBuffer || 100, // ms buffer between requests
            ...config
        };

        if (!this.config.apiKey) {
            throw new Error('Linear API key is required');
        }

        // Initialize Linear SDK client
        this.linearClient = new LinearClient({
            apiKey: this.config.apiKey
        });

        // Initialize GraphQL client for custom queries
        this.graphqlClient = new GraphQLClient(this.config.baseUrl, {
            headers: {
                'Authorization': this.config.apiKey,
                'Content-Type': 'application/json'
            },
            timeout: this.config.timeout
        });

        // Rate limiting
        this.lastRequestTime = 0;
        this.requestQueue = [];
        this.isProcessingQueue = false;

        // Cache for frequently accessed data
        this.cache = {
            teams: new Map(),
            users: new Map(),
            states: new Map(),
            labels: new Map(),
            projects: new Map()
        };

        // Cache TTL (5 minutes)
        this.cacheTTL = 5 * 60 * 1000;
    }

    /**
     * Rate-limited request wrapper
     */
    async makeRequest(requestFn) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ requestFn, resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Process request queue with rate limiting
     */
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const { requestFn, resolve, reject } = this.requestQueue.shift();

            try {
                // Enforce rate limiting
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                if (timeSinceLastRequest < this.config.rateLimitBuffer) {
                    await this.delay(this.config.rateLimitBuffer - timeSinceLastRequest);
                }

                const result = await this.executeWithRetry(requestFn);
                this.lastRequestTime = Date.now();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Execute request with retry logic
     */
    async executeWithRetry(requestFn, attempt = 1) {
        try {
            return await requestFn();
        } catch (error) {
            if (attempt < this.config.retryAttempts && this.isRetryableError(error)) {
                await this.delay(this.config.retryDelay * attempt);
                return this.executeWithRetry(requestFn, attempt + 1);
            }
            throw this.enhanceError(error);
        }
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const retryableStatuses = [429, 500, 502, 503, 504];
        return retryableStatuses.includes(error.status) || 
               error.code === 'NETWORK_ERROR' ||
               error.message.includes('timeout');
    }

    /**
     * Enhance error with additional context
     */
    enhanceError(error) {
        const enhancedError = new Error(`Linear API Error: ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.status = error.status;
        enhancedError.code = error.code;
        enhancedError.timestamp = new Date().toISOString();
        return enhancedError;
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== TEAM OPERATIONS ====================

    /**
     * Get teams with caching
     */
    async getTeams() {
        const cacheKey = 'all_teams';
        const cached = this.getCachedData('teams', cacheKey);
        if (cached) return cached;

        const teams = await this.makeRequest(async () => {
            const response = await this.linearClient.teams();
            return response.nodes;
        });

        this.setCachedData('teams', cacheKey, teams);
        return teams;
    }

    /**
     * Get team by ID
     */
    async getTeam(teamId) {
        const cached = this.getCachedData('teams', teamId);
        if (cached) return cached;

        const team = await this.makeRequest(async () => {
            return await this.linearClient.team(teamId);
        });

        this.setCachedData('teams', teamId, team);
        return team;
    }

    // ==================== USER OPERATIONS ====================

    /**
     * Get users for a team
     */
    async getTeamUsers(teamId) {
        const cacheKey = `team_users_${teamId}`;
        const cached = this.getCachedData('users', cacheKey);
        if (cached) return cached;

        const users = await this.makeRequest(async () => {
            const team = await this.linearClient.team(teamId);
            const members = await team.members();
            return members.nodes;
        });

        this.setCachedData('users', cacheKey, users);
        return users;
    }

    /**
     * Get current user
     */
    async getCurrentUser() {
        const cacheKey = 'current_user';
        const cached = this.getCachedData('users', cacheKey);
        if (cached) return cached;

        const user = await this.makeRequest(async () => {
            return await this.linearClient.viewer;
        });

        this.setCachedData('users', cacheKey, user);
        return user;
    }

    // ==================== ISSUE OPERATIONS ====================

    /**
     * Create issue
     */
    async createIssue(issueData) {
        return await this.makeRequest(async () => {
            const payload = {
                teamId: issueData.teamId,
                title: issueData.title,
                description: issueData.description,
                priority: issueData.priority,
                stateId: issueData.stateId,
                assigneeId: issueData.assigneeId,
                labelIds: issueData.labelIds,
                projectId: issueData.projectId,
                parentId: issueData.parentId
            };

            const response = await this.linearClient.createIssue(payload);
            return response.issue;
        });
    }

    /**
     * Update issue
     */
    async updateIssue(issueId, updateData) {
        return await this.makeRequest(async () => {
            const response = await this.linearClient.updateIssue(issueId, updateData);
            return response.issue;
        });
    }

    /**
     * Get issue by ID
     */
    async getIssue(issueId) {
        return await this.makeRequest(async () => {
            return await this.linearClient.issue(issueId);
        });
    }

    /**
     * Get issues for team
     */
    async getTeamIssues(teamId, filters = {}) {
        return await this.makeRequest(async () => {
            const team = await this.linearClient.team(teamId);
            const issues = await team.issues({
                filter: filters,
                orderBy: filters.orderBy || 'updatedAt'
            });
            return issues.nodes;
        });
    }

    /**
     * Search issues
     */
    async searchIssues(query, teamId = null) {
        return await this.makeRequest(async () => {
            const searchFilter = {
                title: { contains: query }
            };

            if (teamId) {
                searchFilter.team = { id: { eq: teamId } };
            }

            const issues = await this.linearClient.issues({
                filter: searchFilter
            });
            return issues.nodes;
        });
    }

    // ==================== COMMENT OPERATIONS ====================

    /**
     * Add comment to issue
     */
    async addComment(issueId, body) {
        return await this.makeRequest(async () => {
            const response = await this.linearClient.createComment({
                issueId,
                body
            });
            return response.comment;
        });
    }

    /**
     * Get comments for issue
     */
    async getIssueComments(issueId) {
        return await this.makeRequest(async () => {
            const issue = await this.linearClient.issue(issueId);
            const comments = await issue.comments();
            return comments.nodes;
        });
    }

    // ==================== STATE OPERATIONS ====================

    /**
     * Get workflow states for team
     */
    async getTeamStates(teamId) {
        const cacheKey = `team_states_${teamId}`;
        const cached = this.getCachedData('states', cacheKey);
        if (cached) return cached;

        const states = await this.makeRequest(async () => {
            const team = await this.linearClient.team(teamId);
            const workflowStates = await team.states();
            return workflowStates.nodes;
        });

        this.setCachedData('states', cacheKey, states);
        return states;
    }

    /**
     * Find state by name
     */
    async findStateByName(teamId, stateName) {
        const states = await this.getTeamStates(teamId);
        return states.find(state => 
            state.name.toLowerCase() === stateName.toLowerCase()
        );
    }

    // ==================== LABEL OPERATIONS ====================

    /**
     * Get labels for team
     */
    async getTeamLabels(teamId) {
        const cacheKey = `team_labels_${teamId}`;
        const cached = this.getCachedData('labels', cacheKey);
        if (cached) return cached;

        const labels = await this.makeRequest(async () => {
            const team = await this.linearClient.team(teamId);
            const issueLabels = await team.labels();
            return issueLabels.nodes;
        });

        this.setCachedData('labels', cacheKey, labels);
        return labels;
    }

    /**
     * Create label
     */
    async createLabel(labelData) {
        return await this.makeRequest(async () => {
            const response = await this.linearClient.createIssueLabel({
                teamId: labelData.teamId,
                name: labelData.name,
                color: labelData.color,
                description: labelData.description
            });
            
            // Invalidate cache
            this.invalidateCache('labels', `team_labels_${labelData.teamId}`);
            
            return response.issueLabel;
        });
    }

    /**
     * Find or create label
     */
    async findOrCreateLabel(teamId, labelName, color = '#6B7280') {
        const labels = await this.getTeamLabels(teamId);
        let label = labels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
        
        if (!label) {
            label = await this.createLabel({
                teamId,
                name: labelName,
                color
            });
        }
        
        return label;
    }

    // ==================== PROJECT OPERATIONS ====================

    /**
     * Get projects for team
     */
    async getTeamProjects(teamId) {
        const cacheKey = `team_projects_${teamId}`;
        const cached = this.getCachedData('projects', cacheKey);
        if (cached) return cached;

        const projects = await this.makeRequest(async () => {
            const team = await this.linearClient.team(teamId);
            const teamProjects = await team.projects();
            return teamProjects.nodes;
        });

        this.setCachedData('projects', cacheKey, projects);
        return projects;
    }

    // ==================== WEBHOOK OPERATIONS ====================

    /**
     * Create webhook
     */
    async createWebhook(webhookData) {
        return await this.makeRequest(async () => {
            const response = await this.linearClient.createWebhook({
                url: webhookData.url,
                teamId: webhookData.teamId,
                resourceTypes: webhookData.resourceTypes || ['Issue'],
                secret: webhookData.secret
            });
            return response.webhook;
        });
    }

    /**
     * Get webhooks
     */
    async getWebhooks() {
        return await this.makeRequest(async () => {
            const webhooks = await this.linearClient.webhooks();
            return webhooks.nodes;
        });
    }

    // ==================== CACHE MANAGEMENT ====================

    /**
     * Get cached data
     */
    getCachedData(category, key) {
        const cache = this.cache[category];
        if (!cache) return null;

        const cached = cache.get(key);
        if (!cached) return null;

        const { data, timestamp } = cached;
        if (Date.now() - timestamp > this.cacheTTL) {
            cache.delete(key);
            return null;
        }

        return data;
    }

    /**
     * Set cached data
     */
    setCachedData(category, key, data) {
        const cache = this.cache[category];
        if (cache) {
            cache.set(key, {
                data,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Invalidate cache
     */
    invalidateCache(category, key = null) {
        const cache = this.cache[category];
        if (!cache) return;

        if (key) {
            cache.delete(key);
        } else {
            cache.clear();
        }
    }

    /**
     * Clear all caches
     */
    clearAllCaches() {
        Object.values(this.cache).forEach(cache => cache.clear());
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Test API connection
     */
    async testConnection() {
        try {
            const user = await this.getCurrentUser();
            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get API health status
     */
    async getHealthStatus() {
        const connectionTest = await this.testConnection();
        
        return {
            status: connectionTest.success ? 'healthy' : 'error',
            connection: connectionTest,
            config: {
                baseUrl: this.config.baseUrl,
                timeout: this.config.timeout,
                retryAttempts: this.config.retryAttempts,
                rateLimitBuffer: this.config.rateLimitBuffer
            },
            cache: {
                teams: this.cache.teams.size,
                users: this.cache.users.size,
                states: this.cache.states.size,
                labels: this.cache.labels.size,
                projects: this.cache.projects.size
            },
            queue: {
                pending: this.requestQueue.length,
                processing: this.isProcessingQueue
            }
        };
    }

    /**
     * Get API statistics
     */
    getStatistics() {
        return {
            cacheStats: {
                teams: this.cache.teams.size,
                users: this.cache.users.size,
                states: this.cache.states.size,
                labels: this.cache.labels.size,
                projects: this.cache.projects.size
            },
            queueStats: {
                pending: this.requestQueue.length,
                processing: this.isProcessingQueue,
                lastRequestTime: this.lastRequestTime
            },
            config: {
                timeout: this.config.timeout,
                retryAttempts: this.config.retryAttempts,
                rateLimitBuffer: this.config.rateLimitBuffer,
                cacheTTL: this.cacheTTL
            }
        };
    }
}

export default LinearAPIClient;

