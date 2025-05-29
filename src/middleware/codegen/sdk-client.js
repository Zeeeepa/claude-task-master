/**
 * Codegen SDK Client - Integration with Codegen SDK
 * Handles communication with Codegen SDK using token and org_id
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { configManager } from '../../utils/config-manager.js';
import { authManager } from './auth-manager.js';

class CodegenSDKClient extends EventEmitter {
    constructor() {
        super();
        this.isInitialized = false;
        this.apiBaseUrl = configManager.get('codegen.apiBaseUrl', 'https://api.codegen.sh');
        this.sdkVersion = configManager.get('codegen.sdkVersion', 'latest');
        this.requestTimeout = configManager.get('codegen.requestTimeout', 30000);
        this.retryAttempts = configManager.get('codegen.retryAttempts', 3);
        this.rateLimitDelay = configManager.get('codegen.rateLimitDelay', 1000);
    }

    /**
     * Initialize the SDK client
     */
    async initialize() {
        try {
            logger.info('Initializing Codegen SDK client...');
            
            // Verify authentication
            await authManager.verifyCredentials();
            
            // Test connection
            await this.testConnection();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Codegen SDK client initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Codegen SDK client:', error);
            throw error;
        }
    }

    /**
     * Test connection to Codegen API
     */
    async testConnection() {
        try {
            const response = await this.makeRequest('GET', '/health');
            
            if (response.status !== 'healthy') {
                throw new Error('Codegen API health check failed');
            }
            
            logger.debug('Codegen API connection test successful');
            return response;
        } catch (error) {
            logger.error('Codegen API connection test failed:', error);
            throw error;
        }
    }

    /**
     * Create a new agent session
     */
    async createAgentSession(agentConfig = {}) {
        this.ensureInitialized();
        
        try {
            const sessionData = {
                agent_type: agentConfig.type || 'general',
                capabilities: agentConfig.capabilities || [],
                configuration: agentConfig.configuration || {},
                metadata: agentConfig.metadata || {}
            };

            const response = await this.makeRequest('POST', '/agents/sessions', sessionData);
            
            logger.info(`Agent session created: ${response.session_id}`);
            return response;
        } catch (error) {
            logger.error('Failed to create agent session:', error);
            throw error;
        }
    }

    /**
     * Submit a task to Codegen
     */
    async submitTask(taskData) {
        this.ensureInitialized();
        
        try {
            const task = {
                type: taskData.type,
                description: taskData.description,
                requirements: taskData.requirements || [],
                context: taskData.context || {},
                priority: taskData.priority || 'normal',
                deadline: taskData.deadline || null,
                metadata: taskData.metadata || {}
            };

            const response = await this.makeRequest('POST', '/tasks', task);
            
            logger.info(`Task submitted: ${response.task_id}`);
            this.emit('taskSubmitted', response);
            
            return response;
        } catch (error) {
            logger.error('Failed to submit task:', error);
            throw error;
        }
    }

    /**
     * Get task status
     */
    async getTaskStatus(taskId) {
        this.ensureInitialized();
        
        try {
            const response = await this.makeRequest('GET', `/tasks/${taskId}`);
            return response;
        } catch (error) {
            logger.error(`Failed to get task status for ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Update task
     */
    async updateTask(taskId, updates) {
        this.ensureInitialized();
        
        try {
            const response = await this.makeRequest('PATCH', `/tasks/${taskId}`, updates);
            
            logger.info(`Task updated: ${taskId}`);
            this.emit('taskUpdated', response);
            
            return response;
        } catch (error) {
            logger.error(`Failed to update task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Cancel task
     */
    async cancelTask(taskId, reason = '') {
        this.ensureInitialized();
        
        try {
            const response = await this.makeRequest('POST', `/tasks/${taskId}/cancel`, {
                reason
            });
            
            logger.info(`Task cancelled: ${taskId}`);
            this.emit('taskCancelled', response);
            
            return response;
        } catch (error) {
            logger.error(`Failed to cancel task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Get repository information
     */
    async getRepository(repoId) {
        this.ensureInitialized();
        
        try {
            const response = await this.makeRequest('GET', `/repositories/${repoId}`);
            return response;
        } catch (error) {
            logger.error(`Failed to get repository ${repoId}:`, error);
            throw error;
        }
    }

    /**
     * List repositories
     */
    async listRepositories(filters = {}) {
        this.ensureInitialized();
        
        try {
            const queryParams = new URLSearchParams(filters).toString();
            const endpoint = `/repositories${queryParams ? `?${queryParams}` : ''}`;
            
            const response = await this.makeRequest('GET', endpoint);
            return response;
        } catch (error) {
            logger.error('Failed to list repositories:', error);
            throw error;
        }
    }

    /**
     * Create a pull request
     */
    async createPullRequest(repoId, prData) {
        this.ensureInitialized();
        
        try {
            const pullRequest = {
                title: prData.title,
                description: prData.description,
                source_branch: prData.sourceBranch,
                target_branch: prData.targetBranch || 'main',
                draft: prData.draft || false,
                metadata: prData.metadata || {}
            };

            const response = await this.makeRequest('POST', `/repositories/${repoId}/pull-requests`, pullRequest);
            
            logger.info(`Pull request created: ${response.pr_id}`);
            this.emit('pullRequestCreated', response);
            
            return response;
        } catch (error) {
            logger.error('Failed to create pull request:', error);
            throw error;
        }
    }

    /**
     * Get pull request status
     */
    async getPullRequestStatus(repoId, prId) {
        this.ensureInitialized();
        
        try {
            const response = await this.makeRequest('GET', `/repositories/${repoId}/pull-requests/${prId}`);
            return response;
        } catch (error) {
            logger.error(`Failed to get pull request status for ${prId}:`, error);
            throw error;
        }
    }

    /**
     * Execute code analysis
     */
    async executeCodeAnalysis(analysisRequest) {
        this.ensureInitialized();
        
        try {
            const analysis = {
                repository_id: analysisRequest.repositoryId,
                analysis_type: analysisRequest.type || 'full',
                target_files: analysisRequest.files || [],
                configuration: analysisRequest.configuration || {},
                metadata: analysisRequest.metadata || {}
            };

            const response = await this.makeRequest('POST', '/analysis', analysis);
            
            logger.info(`Code analysis started: ${response.analysis_id}`);
            this.emit('analysisStarted', response);
            
            return response;
        } catch (error) {
            logger.error('Failed to execute code analysis:', error);
            throw error;
        }
    }

    /**
     * Get analysis results
     */
    async getAnalysisResults(analysisId) {
        this.ensureInitialized();
        
        try {
            const response = await this.makeRequest('GET', `/analysis/${analysisId}`);
            return response;
        } catch (error) {
            logger.error(`Failed to get analysis results for ${analysisId}:`, error);
            throw error;
        }
    }

    /**
     * Stream events from Codegen
     */
    async streamEvents(eventTypes = [], callback) {
        this.ensureInitialized();
        
        try {
            // This would implement Server-Sent Events or WebSocket connection
            // For now, we'll use polling as a fallback
            const pollInterval = 5000; // 5 seconds
            
            const poll = async () => {
                try {
                    const response = await this.makeRequest('GET', '/events', {
                        types: eventTypes.join(','),
                        since: Date.now() - pollInterval
                    });
                    
                    if (response.events && response.events.length > 0) {
                        for (const event of response.events) {
                            callback(event);
                        }
                    }
                } catch (error) {
                    logger.error('Error polling events:', error);
                }
                
                setTimeout(poll, pollInterval);
            };
            
            poll();
            
        } catch (error) {
            logger.error('Failed to stream events:', error);
            throw error;
        }
    }

    /**
     * Make HTTP request to Codegen API
     */
    async makeRequest(method, endpoint, data = null, attempt = 1) {
        try {
            const url = `${this.apiBaseUrl}${endpoint}`;
            const headers = await this.getRequestHeaders();
            
            const options = {
                method,
                headers,
                timeout: this.requestTimeout
            };
            
            if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
                options.body = JSON.stringify(data);
            }
            
            logger.debug(`Making ${method} request to ${endpoint}`, { attempt });
            
            const response = await fetch(url, options);
            
            if (!response.ok) {
                await this.handleErrorResponse(response, method, endpoint, data, attempt);
                return;
            }
            
            const result = await response.json();
            return result;
            
        } catch (error) {
            if (attempt < this.retryAttempts) {
                logger.warn(`Request failed, retrying (${attempt}/${this.retryAttempts}):`, error.message);
                await this.delay(this.rateLimitDelay * attempt);
                return this.makeRequest(method, endpoint, data, attempt + 1);
            }
            
            throw error;
        }
    }

    /**
     * Handle error responses
     */
    async handleErrorResponse(response, method, endpoint, data, attempt) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
            // Unauthorized - try to refresh token
            try {
                await authManager.refreshToken();
                if (attempt < this.retryAttempts) {
                    return this.makeRequest(method, endpoint, data, attempt + 1);
                }
            } catch (refreshError) {
                throw new Error('Authentication failed');
            }
        }
        
        if (response.status === 429) {
            // Rate limited
            const retryAfter = response.headers.get('Retry-After') || this.rateLimitDelay;
            if (attempt < this.retryAttempts) {
                await this.delay(parseInt(retryAfter) * 1000);
                return this.makeRequest(method, endpoint, data, attempt + 1);
            }
        }
        
        const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.data = errorData;
        throw error;
    }

    /**
     * Get request headers
     */
    async getRequestHeaders() {
        const credentials = await authManager.getCredentials();
        
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${credentials.token}`,
            'X-Org-ID': credentials.orgId,
            'User-Agent': `TaskMaster-SDK/${this.sdkVersion}`,
            'X-SDK-Version': this.sdkVersion
        };
    }

    /**
     * Ensure client is initialized
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Codegen SDK client is not initialized. Call initialize() first.');
        }
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get client status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            apiBaseUrl: this.apiBaseUrl,
            sdkVersion: this.sdkVersion,
            authenticated: authManager.isAuthenticated()
        };
    }

    /**
     * Disconnect and cleanup
     */
    async disconnect() {
        this.isInitialized = false;
        this.emit('disconnected');
        logger.info('Codegen SDK client disconnected');
    }
}

export const codegenSDKClient = new CodegenSDKClient();
export default CodegenSDKClient;

