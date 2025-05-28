/**
 * Linear GraphQL API Client
 * 
 * Provides a comprehensive interface for interacting with Linear's GraphQL API
 * including authentication, rate limiting, and error handling.
 */

const { GraphQLClient } = require('graphql-request');
const EventEmitter = require('events');

class LinearClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.apiKey = options.apiKey || process.env.LINEAR_API_KEY;
        this.endpoint = options.endpoint || 'https://api.linear.app/graphql';
        this.timeout = options.timeout || 30000;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        
        if (!this.apiKey) {
            throw new Error('Linear API key is required. Set LINEAR_API_KEY environment variable or pass apiKey option.');
        }
        
        this.client = new GraphQLClient(this.endpoint, {
            headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'Claude-Task-Master/1.0.0'
            },
            timeout: this.timeout
        });
        
        // Rate limiting
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.lastRequestTime = 0;
        this.minRequestInterval = 100; // 100ms between requests
    }
    
    /**
     * Execute a GraphQL query with rate limiting and retry logic
     */
    async query(query, variables = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ query, variables, resolve, reject });
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
            const { query, variables, resolve, reject } = this.requestQueue.shift();
            
            try {
                // Rate limiting
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                if (timeSinceLastRequest < this.minRequestInterval) {
                    await this.sleep(this.minRequestInterval - timeSinceLastRequest);
                }
                
                const result = await this.executeWithRetry(query, variables);
                this.lastRequestTime = Date.now();
                resolve(result);
                
            } catch (error) {
                reject(error);
            }
        }
        
        this.isProcessingQueue = false;
    }
    
    /**
     * Execute query with retry logic
     */
    async executeWithRetry(query, variables, attempt = 1) {
        try {
            const result = await this.client.request(query, variables);
            this.emit('request:success', { query, variables, result });
            return result;
            
        } catch (error) {
            this.emit('request:error', { query, variables, error, attempt });
            
            if (attempt < this.retryAttempts && this.isRetryableError(error)) {
                await this.sleep(this.retryDelay * attempt);
                return this.executeWithRetry(query, variables, attempt + 1);
            }
            
            throw this.enhanceError(error);
        }
    }
    
    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        if (error.response?.status >= 500) return true;
        if (error.response?.status === 429) return true;
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
        return false;
    }
    
    /**
     * Enhance error with additional context
     */
    enhanceError(error) {
        const enhancedError = new Error(`Linear API Error: ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.response = error.response;
        enhancedError.request = error.request;
        return enhancedError;
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get current user information
     */
    async getCurrentUser() {
        const query = `
            query {
                viewer {
                    id
                    name
                    email
                    avatarUrl
                    isMe
                    organization {
                        id
                        name
                        urlKey
                    }
                }
            }
        `;
        
        const result = await this.query(query);
        return result.viewer;
    }
    
    /**
     * Get teams accessible to the current user
     */
    async getTeams() {
        const query = `
            query {
                teams {
                    nodes {
                        id
                        name
                        key
                        description
                        private
                        issueCount
                        members {
                            nodes {
                                id
                                name
                                email
                            }
                        }
                    }
                }
            }
        `;
        
        const result = await this.query(query);
        return result.teams.nodes;
    }
    
    /**
     * Get issue states for a team
     */
    async getIssueStates(teamId) {
        const query = `
            query($teamId: String!) {
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
        
        const result = await this.query(query, { teamId });
        return result.team.states.nodes;
    }
    
    /**
     * Get issue labels for a team
     */
    async getIssueLabels(teamId) {
        const query = `
            query($teamId: String!) {
                team(id: $teamId) {
                    labels {
                        nodes {
                            id
                            name
                            color
                            description
                        }
                    }
                }
            }
        `;
        
        const result = await this.query(query, { teamId });
        return result.team.labels.nodes;
    }
    
    /**
     * Test the connection to Linear API
     */
    async testConnection() {
        try {
            const user = await this.getCurrentUser();
            return {
                success: true,
                user: user,
                message: `Connected as ${user.name} (${user.email})`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Failed to connect to Linear API'
            };
        }
    }
}

module.exports = LinearClient;

