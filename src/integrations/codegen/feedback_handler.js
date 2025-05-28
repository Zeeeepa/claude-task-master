/**
 * @fileoverview Codegen Feedback Handler
 * @description Handles error feedback loops, retry mechanisms, and continuous improvement
 */

import { EventEmitter } from 'events';

/**
 * Feedback Handler for Codegen Integration
 * Manages error handling, retry logic, and learning from failures
 */
export class FeedbackHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            retry: {
                maxRetries: config.retry?.maxRetries || 3,
                baseDelay: config.retry?.baseDelay || 1000,
                maxDelay: config.retry?.maxDelay || 30000,
                backoffMultiplier: config.retry?.backoffMultiplier || 2,
                jitter: config.retry?.jitter !== false
            },
            feedback: {
                enableLearning: config.feedback?.enableLearning !== false,
                patternAnalysis: config.feedback?.patternAnalysis !== false,
                errorCategorization: config.feedback?.errorCategorization !== false,
                successPatternTracking: config.feedback?.successPatternTracking !== false
            },
            database: {
                baseUrl: config.database?.baseUrl || process.env.CLOUDFLARE_API_URL,
                apiKey: config.database?.apiKey || process.env.CLOUDFLARE_API_KEY
            },
            thresholds: {
                errorRateThreshold: config.thresholds?.errorRateThreshold || 0.3, // 30%
                retryDelayIncrease: config.thresholds?.retryDelayIncrease || 1.5,
                maxConsecutiveFailures: config.thresholds?.maxConsecutiveFailures || 5
            },
            ...config
        };

        this.isInitialized = false;
        this.retryQueue = new Map();
        this.errorPatterns = new Map();
        this.successPatterns = new Map();
        this.failureHistory = [];
        this.retryTimer = null;

        // Metrics
        this.metrics = {
            totalErrors: 0,
            retriesAttempted: 0,
            retriesSuccessful: 0,
            patternsIdentified: 0,
            improvementsApplied: 0,
            errorCategories: new Map(),
            successRate: 0,
            averageRetryTime: 0
        };
    }

    /**
     * Initialize the feedback handler
     */
    async initialize() {
        try {
            console.log('🔄 Initializing feedback handler...');
            
            this._loadErrorPatterns();
            this._loadSuccessPatterns();
            this._startRetryProcessor();
            
            this.isInitialized = true;
            console.log('✅ Feedback handler initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize feedback handler:', error);
            throw error;
        }
    }

    /**
     * Handle error and determine retry strategy
     * @param {string} taskId - Task ID
     * @param {Error} error - Error object
     * @param {Object} task - Original task object
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Handling result
     */
    async handleError(taskId, error, task, context = {}) {
        try {
            console.log(`🔄 Handling error for task ${taskId}: ${error.message}`);

            // Record error
            this._recordError(taskId, error, task, context);

            // Categorize error
            const errorCategory = this._categorizeError(error);

            // Determine if retry is appropriate
            const retryDecision = await this._shouldRetry(taskId, error, errorCategory);

            if (retryDecision.shouldRetry) {
                // Schedule retry
                await this._scheduleRetry(taskId, error, task, context, retryDecision);
                
                return {
                    action: 'retry_scheduled',
                    retryAt: retryDecision.retryAt,
                    attempt: retryDecision.attempt,
                    delay: retryDecision.delay,
                    reason: retryDecision.reason
                };
            } else {
                // Send feedback to database
                await this._sendErrorFeedback(taskId, error, task, context, errorCategory);
                
                return {
                    action: 'feedback_sent',
                    category: errorCategory,
                    reason: retryDecision.reason,
                    permanent: true
                };
            }

        } catch (handlingError) {
            console.error(`❌ Failed to handle error for task ${taskId}:`, handlingError);
            throw handlingError;
        }
    }

    /**
     * Record successful task completion for pattern learning
     * @param {string} taskId - Task ID
     * @param {Object} task - Task object
     * @param {Object} result - Success result
     * @param {Object} context - Additional context
     */
    async recordSuccess(taskId, task, result, context = {}) {
        try {
            if (!this.config.feedback.successPatternTracking) {
                return;
            }

            console.log(`✅ Recording success pattern for task ${taskId}`);

            const successPattern = {
                taskId,
                taskType: this._determineTaskType(task),
                complexity: this._assessTaskComplexity(task),
                processingTime: result.processingTime,
                promptTemplate: context.promptTemplate,
                codeStyle: context.codeStyle,
                timestamp: new Date().toISOString(),
                metadata: {
                    taskPriority: task.priority,
                    taskLabels: task.labels || [],
                    filesModified: result.filesModified || 0,
                    linesOfCode: result.linesOfCode || 0
                }
            };

            // Store success pattern
            this._storeSuccessPattern(successPattern);

            // Update metrics
            this.metrics.successRate = this._calculateSuccessRate();

            this.emit('success_recorded', { taskId, pattern: successPattern });

        } catch (error) {
            console.error(`Error recording success for task ${taskId}:`, error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Get improvement suggestions based on error patterns
     * @param {Object} task - Task object
     * @returns {Object} Improvement suggestions
     */
    getImprovementSuggestions(task) {
        const suggestions = {
            promptOptimizations: [],
            contextImprovements: [],
            qualityEnhancements: [],
            processOptimizations: []
        };

        try {
            const taskType = this._determineTaskType(task);
            const relevantErrors = this._getRelevantErrorPatterns(taskType);
            const relevantSuccesses = this._getRelevantSuccessPatterns(taskType);

            // Analyze error patterns for improvements
            for (const [errorType, pattern] of relevantErrors) {
                if (pattern.frequency > 2) { // Only suggest if error occurred multiple times
                    suggestions.promptOptimizations.push(...this._getPromptSuggestions(errorType, pattern));
                    suggestions.contextImprovements.push(...this._getContextSuggestions(errorType, pattern));
                    suggestions.qualityEnhancements.push(...this._getQualitySuggestions(errorType, pattern));
                }
            }

            // Analyze success patterns for optimizations
            for (const [successType, pattern] of relevantSuccesses) {
                suggestions.processOptimizations.push(...this._getProcessSuggestions(successType, pattern));
            }

            // Remove duplicates
            Object.keys(suggestions).forEach(key => {
                suggestions[key] = [...new Set(suggestions[key])];
            });

            return suggestions;

        } catch (error) {
            console.error('Error generating improvement suggestions:', error);
            return suggestions;
        }
    }

    /**
     * Record error for analysis
     * @param {string} taskId - Task ID
     * @param {Error} error - Error object
     * @param {Object} task - Task object
     * @param {Object} context - Additional context
     * @private
     */
    _recordError(taskId, error, task, context) {
        const errorRecord = {
            taskId,
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
                code: error.code
            },
            task: {
                type: this._determineTaskType(task),
                complexity: this._assessTaskComplexity(task),
                priority: task.priority,
                labels: task.labels || []
            },
            context: {
                promptTemplate: context.promptTemplate,
                processingTime: context.processingTime,
                retryAttempt: context.retryAttempt || 0
            },
            timestamp: new Date().toISOString()
        };

        this.failureHistory.push(errorRecord);
        this.metrics.totalErrors++;

        // Keep only last 1000 error records
        if (this.failureHistory.length > 1000) {
            this.failureHistory = this.failureHistory.slice(-1000);
        }
    }

    /**
     * Categorize error type
     * @param {Error} error - Error object
     * @returns {string} Error category
     * @private
     */
    _categorizeError(error) {
        const message = error.message.toLowerCase();
        const code = error.code;

        // Network/API errors
        if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
            return 'network';
        }

        // Authentication errors
        if (message.includes('auth') || message.includes('unauthorized') || code === 401) {
            return 'authentication';
        }

        // Rate limiting
        if (message.includes('rate limit') || code === 429) {
            return 'rate_limit';
        }

        // Validation errors
        if (message.includes('validation') || message.includes('invalid') || code === 400) {
            return 'validation';
        }

        // Server errors
        if (code >= 500 || message.includes('server error')) {
            return 'server';
        }

        // Quota/billing errors
        if (message.includes('quota') || message.includes('billing') || message.includes('credits')) {
            return 'quota';
        }

        // Prompt/content errors
        if (message.includes('prompt') || message.includes('content') || message.includes('length')) {
            return 'prompt';
        }

        return 'unknown';
    }

    /**
     * Determine if task should be retried
     * @param {string} taskId - Task ID
     * @param {Error} error - Error object
     * @param {string} errorCategory - Error category
     * @returns {Promise<Object>} Retry decision
     * @private
     */
    async _shouldRetry(taskId, error, errorCategory) {
        const existingRetry = this.retryQueue.get(taskId);
        const currentAttempt = existingRetry ? existingRetry.attempt + 1 : 1;

        // Check max retries
        if (currentAttempt > this.config.retry.maxRetries) {
            return {
                shouldRetry: false,
                reason: 'max_retries_exceeded',
                attempt: currentAttempt
            };
        }

        // Check error category for retry eligibility
        const retryableCategories = ['network', 'rate_limit', 'server', 'timeout'];
        if (!retryableCategories.includes(errorCategory)) {
            return {
                shouldRetry: false,
                reason: `non_retryable_error_${errorCategory}`,
                attempt: currentAttempt
            };
        }

        // Calculate delay
        const delay = this._calculateRetryDelay(currentAttempt, errorCategory);
        const retryAt = new Date(Date.now() + delay);

        return {
            shouldRetry: true,
            reason: `retryable_${errorCategory}`,
            attempt: currentAttempt,
            delay,
            retryAt
        };
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt - Retry attempt number
     * @param {string} errorCategory - Error category
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateRetryDelay(attempt, errorCategory) {
        let baseDelay = this.config.retry.baseDelay;

        // Adjust base delay for specific error types
        switch (errorCategory) {
            case 'rate_limit':
                baseDelay *= 3; // Longer delay for rate limits
                break;
            case 'server':
                baseDelay *= 2; // Moderate delay for server errors
                break;
            case 'network':
                baseDelay *= 1.5; // Slight increase for network errors
                break;
        }

        // Exponential backoff
        let delay = baseDelay * Math.pow(this.config.retry.backoffMultiplier, attempt - 1);

        // Add jitter if enabled
        if (this.config.retry.jitter) {
            const jitterAmount = delay * 0.1; // 10% jitter
            delay += (Math.random() - 0.5) * 2 * jitterAmount;
        }

        // Cap at max delay
        return Math.min(delay, this.config.retry.maxDelay);
    }

    /**
     * Schedule retry for task
     * @param {string} taskId - Task ID
     * @param {Error} error - Error object
     * @param {Object} task - Task object
     * @param {Object} context - Additional context
     * @param {Object} retryDecision - Retry decision
     * @private
     */
    async _scheduleRetry(taskId, error, task, context, retryDecision) {
        const retryInfo = {
            taskId,
            task,
            context: {
                ...context,
                retryAttempt: retryDecision.attempt,
                originalError: error.message
            },
            attempt: retryDecision.attempt,
            scheduledAt: new Date().toISOString(),
            retryAt: retryDecision.retryAt,
            delay: retryDecision.delay,
            reason: retryDecision.reason
        };

        this.retryQueue.set(taskId, retryInfo);
        this.metrics.retriesAttempted++;

        console.log(`⏰ Scheduled retry ${retryDecision.attempt} for task ${taskId} in ${retryDecision.delay}ms`);

        this.emit('retry_scheduled', {
            taskId,
            attempt: retryDecision.attempt,
            retryAt: retryDecision.retryAt,
            delay: retryDecision.delay
        });

        // Update task status in database
        await this._updateTaskRetryStatus(taskId, retryInfo);
    }

    /**
     * Send error feedback to database
     * @param {string} taskId - Task ID
     * @param {Error} error - Error object
     * @param {Object} task - Task object
     * @param {Object} context - Additional context
     * @param {string} errorCategory - Error category
     * @private
     */
    async _sendErrorFeedback(taskId, error, task, context, errorCategory) {
        try {
            const feedback = {
                task_id: taskId,
                error_category: errorCategory,
                error_message: error.message,
                error_code: error.code,
                task_type: this._determineTaskType(task),
                task_complexity: this._assessTaskComplexity(task),
                context: {
                    prompt_template: context.promptTemplate,
                    processing_time: context.processingTime,
                    retry_attempts: context.retryAttempt || 0
                },
                improvement_suggestions: this.getImprovementSuggestions(task),
                timestamp: new Date().toISOString(),
                status: 'failed_permanently'
            };

            const response = await fetch(`${this.config.database.baseUrl}/tasks/${taskId}/feedback`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.database.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(feedback)
            });

            if (!response.ok) {
                throw new Error(`Failed to send feedback: ${response.status}`);
            }

            console.log(`📤 Sent error feedback for task ${taskId}`);
            this.emit('feedback_sent', { taskId, feedback });

        } catch (feedbackError) {
            console.error(`Failed to send error feedback for task ${taskId}:`, feedbackError);
            // Don't throw - this is not critical for the main workflow
        }
    }

    /**
     * Update task retry status in database
     * @param {string} taskId - Task ID
     * @param {Object} retryInfo - Retry information
     * @private
     */
    async _updateTaskRetryStatus(taskId, retryInfo) {
        try {
            const response = await fetch(`${this.config.database.baseUrl}/tasks/${taskId}/retry`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.config.database.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'retry_scheduled',
                    retry_attempt: retryInfo.attempt,
                    retry_at: retryInfo.retryAt,
                    retry_reason: retryInfo.reason
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to update retry status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Failed to update retry status for task ${taskId}:`, error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Start retry processor
     * @private
     */
    _startRetryProcessor() {
        this.retryTimer = setInterval(() => {
            this._processRetryQueue();
        }, 5000); // Check every 5 seconds

        console.log('🔄 Started retry processor');
    }

    /**
     * Process retry queue
     * @private
     */
    async _processRetryQueue() {
        const now = new Date();
        const readyRetries = [];

        for (const [taskId, retryInfo] of this.retryQueue) {
            if (new Date(retryInfo.retryAt) <= now) {
                readyRetries.push([taskId, retryInfo]);
            }
        }

        for (const [taskId, retryInfo] of readyRetries) {
            try {
                console.log(`🔄 Processing retry for task ${taskId} (attempt ${retryInfo.attempt})`);
                
                // Remove from queue
                this.retryQueue.delete(taskId);

                // Emit retry event for processing
                this.emit('retry_ready', {
                    taskId,
                    task: retryInfo.task,
                    context: retryInfo.context,
                    attempt: retryInfo.attempt
                });

            } catch (error) {
                console.error(`Error processing retry for task ${taskId}:`, error);
                this.retryQueue.delete(taskId); // Remove failed retry
            }
        }
    }

    /**
     * Load error patterns from storage
     * @private
     */
    _loadErrorPatterns() {
        // In a real implementation, this would load from persistent storage
        this.errorPatterns = new Map();
    }

    /**
     * Load success patterns from storage
     * @private
     */
    _loadSuccessPatterns() {
        // In a real implementation, this would load from persistent storage
        this.successPatterns = new Map();
    }

    /**
     * Store success pattern
     * @param {Object} pattern - Success pattern
     * @private
     */
    _storeSuccessPattern(pattern) {
        const key = `${pattern.taskType}_${pattern.complexity}`;
        
        if (!this.successPatterns.has(key)) {
            this.successPatterns.set(key, {
                patterns: [],
                averageTime: 0,
                successCount: 0
            });
        }

        const existing = this.successPatterns.get(key);
        existing.patterns.push(pattern);
        existing.successCount++;
        existing.averageTime = existing.patterns.reduce((sum, p) => sum + p.processingTime, 0) / existing.patterns.length;

        // Keep only last 100 patterns per type
        if (existing.patterns.length > 100) {
            existing.patterns = existing.patterns.slice(-100);
        }
    }

    /**
     * Determine task type
     * @param {Object} task - Task object
     * @returns {string} Task type
     * @private
     */
    _determineTaskType(task) {
        const labels = (task.labels || []).map(l => l.toLowerCase());
        
        if (labels.includes('bug') || labels.includes('bugfix')) return 'bugfix';
        if (labels.includes('feature') || labels.includes('enhancement')) return 'feature';
        if (labels.includes('docs') || labels.includes('documentation')) return 'documentation';
        if (labels.includes('test') || labels.includes('testing')) return 'test';
        if (labels.includes('refactor')) return 'refactor';
        
        return 'general';
    }

    /**
     * Assess task complexity
     * @param {Object} task - Task object
     * @returns {string} Complexity level
     * @private
     */
    _assessTaskComplexity(task) {
        const description = (task.description || '').length;
        const criteriaCount = (task.acceptance_criteria || []).length;
        const requirementsCount = (task.technical_requirements || []).length;
        
        const complexityScore = description / 100 + criteriaCount * 2 + requirementsCount * 3;
        
        if (complexityScore < 5) return 'low';
        if (complexityScore < 15) return 'medium';
        return 'high';
    }

    /**
     * Calculate success rate
     * @returns {number} Success rate percentage
     * @private
     */
    _calculateSuccessRate() {
        const totalTasks = this.metrics.totalErrors + this.successPatterns.size;
        return totalTasks > 0 ? ((this.successPatterns.size / totalTasks) * 100) : 0;
    }

    /**
     * Get relevant error patterns for task type
     * @param {string} taskType - Task type
     * @returns {Map} Relevant error patterns
     * @private
     */
    _getRelevantErrorPatterns(taskType) {
        // Filter error patterns by task type
        const relevant = new Map();
        
        for (const [key, pattern] of this.errorPatterns) {
            if (key.includes(taskType)) {
                relevant.set(key, pattern);
            }
        }
        
        return relevant;
    }

    /**
     * Get relevant success patterns for task type
     * @param {string} taskType - Task type
     * @returns {Map} Relevant success patterns
     * @private
     */
    _getRelevantSuccessPatterns(taskType) {
        const relevant = new Map();
        
        for (const [key, pattern] of this.successPatterns) {
            if (key.includes(taskType)) {
                relevant.set(key, pattern);
            }
        }
        
        return relevant;
    }

    /**
     * Get prompt suggestions based on error pattern
     * @param {string} errorType - Error type
     * @param {Object} pattern - Error pattern
     * @returns {Array} Prompt suggestions
     * @private
     */
    _getPromptSuggestions(errorType, pattern) {
        const suggestions = [];
        
        switch (errorType) {
            case 'validation':
                suggestions.push('Add more specific validation requirements to prompt');
                suggestions.push('Include input/output examples in prompt');
                break;
            case 'prompt':
                suggestions.push('Reduce prompt length and complexity');
                suggestions.push('Use more structured prompt format');
                break;
        }
        
        return suggestions;
    }

    /**
     * Get context suggestions based on error pattern
     * @param {string} errorType - Error type
     * @param {Object} pattern - Error pattern
     * @returns {Array} Context suggestions
     * @private
     */
    _getContextSuggestions(errorType, pattern) {
        const suggestions = [];
        
        switch (errorType) {
            case 'validation':
                suggestions.push('Include more relevant file context');
                suggestions.push('Add dependency information');
                break;
        }
        
        return suggestions;
    }

    /**
     * Get quality suggestions based on error pattern
     * @param {string} errorType - Error type
     * @param {Object} pattern - Error pattern
     * @returns {Array} Quality suggestions
     * @private
     */
    _getQualitySuggestions(errorType, pattern) {
        const suggestions = [];
        
        switch (errorType) {
            case 'validation':
                suggestions.push('Increase test coverage requirements');
                suggestions.push('Add code review checkpoints');
                break;
        }
        
        return suggestions;
    }

    /**
     * Get process suggestions based on success pattern
     * @param {string} successType - Success type
     * @param {Object} pattern - Success pattern
     * @returns {Array} Process suggestions
     * @private
     */
    _getProcessSuggestions(successType, pattern) {
        const suggestions = [];
        
        if (pattern.averageTime < 60000) { // Less than 1 minute
            suggestions.push('Consider batching similar tasks for efficiency');
        }
        
        return suggestions;
    }

    /**
     * Get metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            retryQueueSize: this.retryQueue.size,
            errorPatternsCount: this.errorPatterns.size,
            successPatternsCount: this.successPatterns.size,
            retrySuccessRate: this.metrics.retriesAttempted > 0 ? 
                (this.metrics.retriesSuccessful / this.metrics.retriesAttempted) * 100 : 0
        };
    }

    /**
     * Get status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            retryQueueSize: this.retryQueue.size,
            metrics: this.getMetrics(),
            config: {
                retry: this.config.retry,
                feedback: this.config.feedback,
                thresholds: this.config.thresholds
            }
        };
    }

    /**
     * Shutdown the feedback handler
     */
    async shutdown() {
        console.log('🔄 Shutting down feedback handler...');
        
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
        
        this.retryQueue.clear();
        this.errorPatterns.clear();
        this.successPatterns.clear();
        this.failureHistory = [];
        this.isInitialized = false;
        this.removeAllListeners();
        
        console.log('✅ Feedback handler shutdown complete');
    }
}

export default FeedbackHandler;

