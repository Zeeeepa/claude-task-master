/**
 * @fileoverview Codegen SDK Integration
 * @description Comprehensive Codegen SDK integration for natural language task processing
 */

import EventEmitter from 'events';
import { integrationConfig } from '../config/integrations.js';

/**
 * Codegen SDK Integration Service
 * Handles all Codegen SDK operations and task processing
 */
export class CodegenSDKIntegration extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.codegen,
            ...config
        };
        
        this.apiKey = this.config.apiKey;
        this.orgId = this.config.orgId;
        this.baseUrl = this.config.baseUrl;
        
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
        this.activeRequests = new Map();
        this.requestHistory = [];
        this.metrics = {
            requestCount: 0,
            errorCount: 0,
            successCount: 0,
            lastRequest: null,
            averageResponseTime: 0,
            totalProcessingTime: 0
        };
    }
    
    /**
     * Initialize the Codegen SDK
     */
    async initializeSDK(apiKey = null, orgId = null) {
        try {
            this.apiKey = apiKey || this.apiKey;
            this.orgId = orgId || this.orgId;
            
            if (!this.apiKey || !this.orgId) {
                throw new Error('API key and organization ID are required');
            }
            
            // Validate connection
            await this.validateConnection();
            
            this.isInitialized = true;
            this.emit('initialized', { apiKey: this.apiKey, orgId: this.orgId });
            console.log('Codegen SDK integration initialized successfully');
            
            return {
                initialized: true,
                apiKey: this.apiKey,
                orgId: this.orgId,
                baseUrl: this.baseUrl
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize Codegen SDK: ${error.message}`);
        }
    }
    
    /**
     * Validate connection to Codegen API
     */
    async validateConnection() {
        try {
            const response = await this.makeRequest('GET', '/health');
            if (!response.status || response.status !== 'ok') {
                throw new Error('Invalid API response');
            }
            return true;
        } catch (error) {
            throw new Error(`Codegen connection validation failed: ${error.message}`);
        }
    }
    
    /**
     * Send task request to Codegen
     */
    async sendTaskRequest(task, context = {}) {
        try {
            if (!this.isInitialized) {
                await this.initializeSDK();
            }
            
            const formattedTask = this.formatTaskForCodegen(task);
            const requestId = this.generateRequestId();
            
            const requestData = {
                id: requestId,
                task: formattedTask,
                context: {
                    orgId: this.orgId,
                    timestamp: new Date().toISOString(),
                    ...context
                },
                options: {
                    timeout: this.config.timeout,
                    retryAttempts: this.config.retryAttempts,
                    priority: task.priority || 'normal'
                }
            };
            
            // Track active request
            this.activeRequests.set(requestId, {
                task: formattedTask,
                startTime: Date.now(),
                status: 'pending'
            });
            
            this.emit('task.request.sent', { requestId, task: formattedTask, context });
            
            const response = await this.makeRequest('POST', '/tasks', requestData);
            
            if (!response.success) {
                throw new Error(response.error || 'Task request failed');
            }
            
            // Update request tracking
            this.activeRequests.set(requestId, {
                ...this.activeRequests.get(requestId),
                status: 'processing',
                responseId: response.id
            });
            
            const processedResponse = await this.processResponse(response);
            
            this.emit('task.request.completed', { 
                requestId, 
                response: processedResponse,
                task: formattedTask
            });
            
            return {
                requestId,
                responseId: response.id,
                result: processedResponse,
                metadata: {
                    processingTime: Date.now() - this.activeRequests.get(requestId).startTime,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            this.emit('error', error);
            
            // Handle error with retry logic
            if (this.shouldRetry(error)) {
                return this.retryRequest(task, 1, context);
            }
            
            throw new Error(`Failed to send task request: ${error.message}`);
        }
    }
    
    /**
     * Process Codegen response
     */
    async processResponse(response) {
        try {
            const processedResponse = {
                id: response.id,
                status: response.status,
                result: response.result,
                code: response.code || null,
                files: response.files || [],
                metadata: response.metadata || {},
                timestamp: response.timestamp || new Date().toISOString(),
                processingTime: response.processingTime || 0
            };
            
            // Validate response structure
            if (!processedResponse.result) {
                throw new Error('Invalid response: missing result');
            }
            
            // Process any code files
            if (processedResponse.files && processedResponse.files.length > 0) {
                processedResponse.files = processedResponse.files.map(file => ({
                    path: file.path,
                    content: file.content,
                    language: file.language || this.detectLanguage(file.path),
                    size: file.content ? file.content.length : 0
                }));
            }
            
            this.emit('response.processed', { response: processedResponse });
            
            return processedResponse;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to process response: ${error.message}`);
        }
    }
    
    /**
     * Handle errors with context
     */
    async handleErrors(error, task) {
        try {
            const errorContext = {
                error: {
                    message: error.message,
                    stack: error.stack,
                    code: error.code || 'UNKNOWN'
                },
                task: {
                    id: task.id,
                    type: task.type,
                    description: task.description
                },
                timestamp: new Date().toISOString(),
                service: 'codegen'
            };
            
            // Classify error type
            const errorType = this.classifyError(error);
            errorContext.errorType = errorType;
            
            // Log error for monitoring
            this.logError(errorContext);
            
            this.emit('error.handled', errorContext);
            
            // Return error handling strategy
            return {
                shouldRetry: this.shouldRetry(error),
                retryDelay: this.calculateRetryDelay(errorType),
                fallbackAction: this.getFallbackAction(errorType),
                errorContext
            };
        } catch (handlingError) {
            console.error('Error in error handling:', handlingError);
            throw handlingError;
        }
    }
    
    /**
     * Retry request with exponential backoff
     */
    async retryRequest(task, retryCount, context = {}) {
        try {
            if (retryCount > this.config.retryAttempts) {
                throw new Error(`Max retry attempts (${this.config.retryAttempts}) exceeded`);
            }
            
            const delay = this.calculateRetryDelay('TRANSIENT') * Math.pow(2, retryCount - 1);
            
            this.emit('task.retry.attempt', { 
                task, 
                retryCount, 
                delay,
                maxAttempts: this.config.retryAttempts
            });
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Retry the request
            return this.sendTaskRequest(task, {
                ...context,
                retryAttempt: retryCount,
                originalRequestTime: context.originalRequestTime || new Date().toISOString()
            });
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Retry attempt ${retryCount} failed: ${error.message}`);
        }
    }
    
    /**
     * Track request progress
     */
    async trackRequestProgress(requestId) {
        try {
            if (!this.activeRequests.has(requestId)) {
                throw new Error(`Request ${requestId} not found`);
            }
            
            const request = this.activeRequests.get(requestId);
            
            // Get progress from API if available
            const response = await this.makeRequest('GET', `/tasks/${request.responseId}/progress`);
            
            const progress = {
                requestId,
                status: response.status || request.status,
                progress: response.progress || 0,
                estimatedCompletion: response.estimatedCompletion,
                currentStep: response.currentStep,
                totalSteps: response.totalSteps,
                elapsedTime: Date.now() - request.startTime,
                lastUpdate: new Date().toISOString()
            };
            
            this.emit('task.progress.updated', progress);
            
            return progress;
        } catch (error) {
            // If progress tracking fails, return basic info
            const request = this.activeRequests.get(requestId);
            if (request) {
                return {
                    requestId,
                    status: request.status,
                    elapsedTime: Date.now() - request.startTime,
                    lastUpdate: new Date().toISOString()
                };
            }
            
            throw new Error(`Failed to track request progress: ${error.message}`);
        }
    }
    
    /**
     * Format task for Codegen processing
     */
    formatTaskForCodegen(task) {
        try {
            const formattedTask = {
                id: task.id || this.generateTaskId(),
                type: task.type || 'code_generation',
                title: task.title || task.name,
                description: task.description,
                requirements: task.requirements || [],
                context: {
                    language: task.language || 'javascript',
                    framework: task.framework,
                    dependencies: task.dependencies || [],
                    constraints: task.constraints || [],
                    files: task.files || [],
                    repository: task.repository
                },
                priority: task.priority || 'normal',
                deadline: task.deadline,
                metadata: {
                    source: 'claude-task-master',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    ...task.metadata
                }
            };
            
            // Validate required fields
            if (!formattedTask.description) {
                throw new Error('Task description is required');
            }
            
            this.emit('task.formatted', { original: task, formatted: formattedTask });
            
            return formattedTask;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to format task: ${error.message}`);
        }
    }
    
    /**
     * Classify error type
     */
    classifyError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('rate limit') || message.includes('too many requests')) {
            return 'RATE_LIMIT';
        }
        
        if (message.includes('timeout') || message.includes('timed out')) {
            return 'TIMEOUT';
        }
        
        if (message.includes('network') || message.includes('connection')) {
            return 'NETWORK';
        }
        
        if (message.includes('unauthorized') || message.includes('forbidden')) {
            return 'AUTH';
        }
        
        if (message.includes('not found') || message.includes('404')) {
            return 'NOT_FOUND';
        }
        
        if (message.includes('server error') || message.includes('500')) {
            return 'SERVER_ERROR';
        }
        
        return 'UNKNOWN';
    }
    
    /**
     * Check if error should trigger retry
     */
    shouldRetry(error) {
        const errorType = this.classifyError(error);
        const retryableTypes = ['RATE_LIMIT', 'TIMEOUT', 'NETWORK', 'SERVER_ERROR'];
        return retryableTypes.includes(errorType);
    }
    
    /**
     * Calculate retry delay based on error type
     */
    calculateRetryDelay(errorType) {
        const baseDelay = this.config.retryDelay;
        
        switch (errorType) {
            case 'RATE_LIMIT':
                return baseDelay * 3; // Longer delay for rate limits
            case 'TIMEOUT':
                return baseDelay * 2;
            case 'NETWORK':
                return baseDelay * 1.5;
            case 'SERVER_ERROR':
                return baseDelay * 2;
            default:
                return baseDelay;
        }
    }
    
    /**
     * Get fallback action for error type
     */
    getFallbackAction(errorType) {
        switch (errorType) {
            case 'AUTH':
                return 'REFRESH_TOKEN';
            case 'NOT_FOUND':
                return 'CHECK_ENDPOINT';
            case 'RATE_LIMIT':
                return 'WAIT_AND_RETRY';
            case 'TIMEOUT':
                return 'REDUCE_PAYLOAD';
            default:
                return 'RETRY_WITH_BACKOFF';
        }
    }
    
    /**
     * Detect programming language from file path
     */
    detectLanguage(filePath) {
        const extension = filePath.split('.').pop().toLowerCase();
        
        const languageMap = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'swift': 'swift',
            'kt': 'kotlin',
            'scala': 'scala',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown'
        };
        
        return languageMap[extension] || 'text';
    }
    
    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Generate unique task ID
     */
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Log error for monitoring
     */
    logError(errorContext) {
        this.requestHistory.push({
            type: 'error',
            timestamp: errorContext.timestamp,
            error: errorContext.error,
            task: errorContext.task
        });
        
        // Keep only last 100 entries
        if (this.requestHistory.length > 100) {
            this.requestHistory = this.requestHistory.slice(-100);
        }
    }
    
    /**
     * Make HTTP request to Codegen API
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
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'claude-task-master/1.0.0',
                    'X-Org-ID': this.orgId
                },
                timeout: this.config.timeout
            };
            
            if (data) {
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
        this.metrics.totalProcessingTime += responseTime;
        
        if (isError) {
            this.metrics.errorCount++;
        } else {
            this.metrics.successCount++;
        }
        
        // Calculate rolling average response time
        this.metrics.averageResponseTime = 
            this.metrics.totalProcessingTime / this.metrics.requestCount;
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        const errorRate = this.metrics.requestCount > 0 ? 
            (this.metrics.errorCount / this.metrics.requestCount) * 100 : 0;
        
        const successRate = this.metrics.requestCount > 0 ? 
            (this.metrics.successCount / this.metrics.requestCount) * 100 : 0;
        
        return {
            service: 'codegen',
            status: this.circuitBreaker.state === 'OPEN' ? 'unhealthy' : 'healthy',
            initialized: this.isInitialized,
            circuitBreaker: this.circuitBreaker.state,
            activeRequests: this.activeRequests.size,
            metrics: {
                ...this.metrics,
                errorRate: Math.round(errorRate * 100) / 100,
                successRate: Math.round(successRate * 100) / 100
            },
            rateLimiter: {
                requests: this.rateLimiter.requests,
                maxRequests: this.rateLimiter.maxRequests,
                windowStart: this.rateLimiter.windowStart
            }
        };
    }
    
    /**
     * Clean up completed requests
     */
    cleanupCompletedRequests() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [requestId, request] of this.activeRequests.entries()) {
            if (now - request.startTime > maxAge) {
                this.activeRequests.delete(requestId);
            }
        }
    }
}

export default CodegenSDKIntegration;

