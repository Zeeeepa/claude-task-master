/**
 * @fileoverview Real Codegen Client
 * @description Production-ready Codegen API client using the Python SDK
 */

import { CodegenSDKWrapper } from '../utils/codegen_sdk_wrapper.js';
import { PromptOptimizer } from '../utils/prompt_optimizer.js';
import { RetryManager } from '../utils/retry_manager.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Real Codegen client that replaces the mock implementation
 */
export class CodegenClient {
    constructor(config) {
        this.config = config;
        this.sdkWrapper = new CodegenSDKWrapper(config);
        this.promptOptimizer = new PromptOptimizer(config);
        this.retryManager = new RetryManager(config);
        
        // Connection state
        this.isConnected = false;
        this.lastConnectionTest = null;
        
        // Request tracking
        this.activeRequests = new Map();
        this.requestHistory = [];
        
        log('debug', 'CodegenClient initialized');
    }

    /**
     * Initialize the client and test connection
     */
    async initialize() {
        log('info', 'Initializing Codegen client...');
        
        if (this.config.enable_mock) {
            log('info', 'Running in mock mode - skipping real API initialization');
            this.isConnected = true;
            return;
        }
        
        try {
            await this.validateConnection();
            log('info', 'Codegen client initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize Codegen client: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate connection to Codegen API
     * @returns {Promise<boolean>} Connection status
     */
    async validateConnection() {
        if (this.config.enable_mock) {
            this.isConnected = true;
            this.lastConnectionTest = new Date();
            return true;
        }
        
        log('debug', 'Validating Codegen API connection...');
        
        try {
            const isConnected = await this.retryManager.executeWithRetry(
                () => this.sdkWrapper.testConnection(),
                { operation_id: 'connection_test' }
            );
            
            this.isConnected = isConnected;
            this.lastConnectionTest = new Date();
            
            if (isConnected) {
                log('info', 'Codegen API connection validated successfully');
            } else {
                log('error', 'Codegen API connection validation failed');
            }
            
            return isConnected;
            
        } catch (error) {
            this.isConnected = false;
            this.lastConnectionTest = new Date();
            log('error', `Connection validation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send request to Codegen API
     * @param {Object} prompt - Optimized prompt object
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Codegen response
     */
    async sendCodegenRequest(prompt, taskId) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        log('info', `Sending Codegen request for task ${taskId} (request: ${requestId})`);
        
        // Track active request
        this.activeRequests.set(requestId, {
            task_id: taskId,
            request_id: requestId,
            started_at: new Date(),
            status: 'processing'
        });
        
        try {
            let result;
            
            if (this.config.enable_mock) {
                result = await this._createMockResponse(prompt, taskId);
            } else {
                // Ensure we have a valid connection
                if (!this.isConnected || this._shouldTestConnection()) {
                    await this.validateConnection();
                }
                
                // Execute with retry logic
                result = await this.retryManager.executeWithRetry(
                    () => this.sdkWrapper.executeTask(prompt),
                    { 
                        operation_id: requestId,
                        task_id: taskId 
                    }
                );
            }
            
            const responseTime = Date.now() - startTime;
            
            // Update request tracking
            const requestInfo = this.activeRequests.get(requestId);
            requestInfo.status = result.success ? 'completed' : 'failed';
            requestInfo.response_time_ms = responseTime;
            requestInfo.result = result;
            
            // Move to history
            this.requestHistory.push(requestInfo);
            this.activeRequests.delete(requestId);
            
            // Enhance result with additional metadata
            const enhancedResult = {
                ...result,
                request_id: requestId,
                response_time_ms: responseTime,
                timestamp: new Date().toISOString()
            };
            
            log('info', `Codegen request completed for task ${taskId} in ${responseTime}ms`);
            return enhancedResult;
            
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Update request tracking
            const requestInfo = this.activeRequests.get(requestId);
            if (requestInfo) {
                requestInfo.status = 'failed';
                requestInfo.error = error.message;
                requestInfo.response_time_ms = responseTime;
                
                // Move to history
                this.requestHistory.push(requestInfo);
                this.activeRequests.delete(requestId);
            }
            
            log('error', `Codegen request failed for task ${taskId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                error_type: error.errorType || 'unknown',
                guidance: error.guidance,
                request_id: requestId,
                response_time_ms: responseTime,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get client health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = this._getRequestStats();
        
        return {
            status: this.isConnected ? 'healthy' : 'unhealthy',
            mode: this.config.enable_mock ? 'mock' : 'production',
            connected: this.isConnected,
            last_connection_test: this.lastConnectionTest,
            api_url: this.config.api_url,
            active_requests: this.activeRequests.size,
            total_requests: stats.total,
            success_rate: stats.success_rate,
            average_response_time: stats.average_response_time,
            sdk_health: await this.sdkWrapper.getHealth(),
            retry_stats: this.retryManager.getStatistics()
        };
    }

    /**
     * Shutdown the client
     */
    async shutdown() {
        log('debug', 'Shutting down Codegen client...');
        
        // Cancel active requests
        for (const [requestId, request] of this.activeRequests) {
            log('warning', `Cancelling active request: ${requestId}`);
            request.status = 'cancelled';
        }
        
        this.isConnected = false;
        log('debug', 'Codegen client shutdown complete');
    }

    /**
     * Get request statistics
     * @returns {Object} Request statistics
     * @private
     */
    _getRequestStats() {
        const allRequests = [...this.requestHistory];
        const total = allRequests.length;
        
        if (total === 0) {
            return {
                total: 0,
                completed: 0,
                failed: 0,
                success_rate: 100,
                average_response_time: 0
            };
        }
        
        const completed = allRequests.filter(r => r.status === 'completed').length;
        const failed = allRequests.filter(r => r.status === 'failed').length;
        const successRate = (completed / total) * 100;
        
        const responseTimes = allRequests
            .filter(r => r.response_time_ms)
            .map(r => r.response_time_ms);
        
        const averageResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
            : 0;
        
        return {
            total,
            completed,
            failed,
            success_rate: Math.round(successRate * 100) / 100,
            average_response_time: Math.round(averageResponseTime)
        };
    }

    /**
     * Check if connection should be tested
     * @returns {boolean} Whether to test connection
     * @private
     */
    _shouldTestConnection() {
        if (!this.lastConnectionTest) {
            return true;
        }
        
        const timeSinceLastTest = Date.now() - this.lastConnectionTest.getTime();
        const testInterval = 5 * 60 * 1000; // 5 minutes
        
        return timeSinceLastTest > testInterval;
    }

    /**
     * Create mock response for development/testing
     * @param {Object} prompt - Prompt object
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Mock response
     * @private
     */
    async _createMockResponse(prompt, taskId) {
        // Simulate API delay
        const delay = 1500 + Math.random() * 2000; // 1.5-3.5 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Generate realistic mock data
        const prNumber = Math.floor(Math.random() * 1000) + 1;
        const branchName = `feature/task-${taskId}-${Date.now()}`;
        
        return {
            success: true,
            data: {
                task_id: taskId,
                status: 'completed',
                pr_url: `https://github.com/example/repo/pull/${prNumber}`,
                pr_number: prNumber,
                branch_name: branchName,
                title: this._extractTitleFromPrompt(prompt),
                repository: 'example/repo',
                created_at: new Date().toISOString(),
                modified_files: this._generateMockFiles(prompt),
                commits: [
                    {
                        sha: this._generateMockSha(),
                        message: `Implement ${this._extractTitleFromPrompt(prompt)}`,
                        author: 'codegen-bot',
                        timestamp: new Date().toISOString()
                    }
                ]
            }
        };
    }

    /**
     * Extract title from prompt for mock response
     * @param {Object} prompt - Prompt object
     * @returns {string} Extracted title
     * @private
     */
    _extractTitleFromPrompt(prompt) {
        const content = prompt.content || '';
        const lines = content.split('\n');
        
        // Look for title in first few lines
        for (const line of lines.slice(0, 5)) {
            if (line.startsWith('# ')) {
                return line.replace('# ', '').trim();
            }
        }
        
        return `Task ${prompt.task_id}`;
    }

    /**
     * Generate mock file list
     * @param {Object} prompt - Prompt object
     * @returns {Array} Mock file list
     * @private
     */
    _generateMockFiles(prompt) {
        const baseFiles = ['src/main.js', 'tests/main.test.js'];
        
        // Add files based on prompt content
        const content = (prompt.content || '').toLowerCase();
        
        if (content.includes('config')) {
            baseFiles.push('config/settings.js');
        }
        
        if (content.includes('util')) {
            baseFiles.push('src/utils/helpers.js');
        }
        
        if (content.includes('api')) {
            baseFiles.push('src/api/endpoints.js');
        }
        
        return baseFiles;
    }

    /**
     * Generate mock commit SHA
     * @returns {string} Mock SHA
     * @private
     */
    _generateMockSha() {
        return Math.random().toString(36).substr(2, 40);
    }
}

export default CodegenClient;

