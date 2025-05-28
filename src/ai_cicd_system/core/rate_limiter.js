/**
 * @fileoverview Rate Limiter for Codegen API
 * @description Advanced rate limiting with multiple strategies and quota management
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Advanced Rate Limiter with multiple strategies
 */
export class RateLimiter {
    constructor(config = {}) {
        this.config = {
            // Rate limits
            requestsPerSecond: config.requestsPerSecond || 2,
            requestsPerMinute: config.requestsPerMinute || 60,
            requestsPerHour: config.requestsPerHour || 1000,
            requestsPerDay: config.requestsPerDay || 10000,
            
            // Burst handling
            burstSize: config.burstSize || 5,
            burstRefillRate: config.burstRefillRate || 1000, // ms
            
            // Backoff strategy
            backoffStrategy: config.backoffStrategy || 'exponential', // linear, exponential, fixed
            baseDelay: config.baseDelay || 1000,
            maxDelay: config.maxDelay || 60000,
            
            // Queue management
            maxQueueSize: config.maxQueueSize || 100,
            enableQueue: config.enableQueue !== false,
            
            ...config
        };
        
        this.requests = [];
        this.queue = [];
        this.tokens = this.config.burstSize; // Token bucket for burst handling
        this.lastRefill = Date.now();
        this.isProcessingQueue = false;
        
        // Start token refill timer
        this._startTokenRefill();
        
        log('debug', 'Rate limiter initialized', this.config);
    }

    /**
     * Acquire permission to make a request
     * @param {Object} options - Request options
     * @returns {Promise<void>}
     */
    async acquire(options = {}) {
        const priority = options.priority || 'normal'; // high, normal, low
        const timeout = options.timeout || 30000;
        
        return new Promise((resolve, reject) => {
            const request = {
                resolve,
                reject,
                priority,
                timestamp: Date.now(),
                timeout: setTimeout(() => {
                    this._removeFromQueue(request);
                    reject(new Error('Rate limiter timeout'));
                }, timeout)
            };
            
            if (this._canMakeRequestNow()) {
                this._processRequest(request);
            } else if (this.config.enableQueue && this.queue.length < this.config.maxQueueSize) {
                this._addToQueue(request);
            } else {
                clearTimeout(request.timeout);
                reject(new Error('Rate limit exceeded and queue is full'));
            }
        });
    }

    /**
     * Check if a request can be made immediately
     * @returns {boolean} Whether request can be made now
     * @private
     */
    _canMakeRequestNow() {
        const now = Date.now();
        
        // Check token bucket (burst handling)
        if (this.tokens <= 0) {
            return false;
        }
        
        // Clean old requests
        this._cleanOldRequests(now);
        
        // Check all rate limits
        const limits = [
            { period: 1000, limit: this.config.requestsPerSecond },
            { period: 60000, limit: this.config.requestsPerMinute },
            { period: 3600000, limit: this.config.requestsPerHour },
            { period: 86400000, limit: this.config.requestsPerDay }
        ];
        
        for (const { period, limit } of limits) {
            const recentRequests = this.requests.filter(time => now - time < period);
            if (recentRequests.length >= limit) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Process a request immediately
     * @param {Object} request - Request object
     * @private
     */
    _processRequest(request) {
        clearTimeout(request.timeout);
        
        // Consume a token
        this.tokens = Math.max(0, this.tokens - 1);
        
        // Record the request
        this.requests.push(Date.now());
        
        // Resolve the promise
        request.resolve();
        
        log('debug', `Request processed. Tokens remaining: ${this.tokens}`);
    }

    /**
     * Add request to queue
     * @param {Object} request - Request object
     * @private
     */
    _addToQueue(request) {
        // Insert based on priority
        if (request.priority === 'high') {
            this.queue.unshift(request);
        } else if (request.priority === 'low') {
            this.queue.push(request);
        } else {
            // Normal priority - insert in middle
            const normalIndex = this.queue.findIndex(r => r.priority === 'low');
            if (normalIndex === -1) {
                this.queue.push(request);
            } else {
                this.queue.splice(normalIndex, 0, request);
            }
        }
        
        log('debug', `Request queued. Queue size: ${this.queue.length}`);
        
        // Start processing queue if not already running
        if (!this.isProcessingQueue) {
            this._processQueue();
        }
    }

    /**
     * Remove request from queue
     * @param {Object} request - Request to remove
     * @private
     */
    _removeFromQueue(request) {
        const index = this.queue.indexOf(request);
        if (index !== -1) {
            this.queue.splice(index, 1);
        }
    }

    /**
     * Process queued requests
     * @private
     */
    async _processQueue() {
        this.isProcessingQueue = true;
        
        while (this.queue.length > 0) {
            if (this._canMakeRequestNow()) {
                const request = this.queue.shift();
                this._processRequest(request);
            } else {
                // Wait before checking again
                const delay = this._calculateDelay();
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        this.isProcessingQueue = false;
    }

    /**
     * Calculate delay based on backoff strategy
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay() {
        const queueLength = this.queue.length;
        
        switch (this.config.backoffStrategy) {
            case 'linear':
                return Math.min(this.config.baseDelay * queueLength, this.config.maxDelay);
                
            case 'exponential':
                return Math.min(this.config.baseDelay * Math.pow(2, Math.min(queueLength, 10)), this.config.maxDelay);
                
            case 'fixed':
            default:
                return this.config.baseDelay;
        }
    }

    /**
     * Clean old request records
     * @param {number} now - Current timestamp
     * @private
     */
    _cleanOldRequests(now) {
        // Keep requests from the last day only
        const oneDayAgo = now - 86400000;
        this.requests = this.requests.filter(time => time > oneDayAgo);
    }

    /**
     * Start token refill timer
     * @private
     */
    _startTokenRefill() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastRefill = now - this.lastRefill;
            
            if (timeSinceLastRefill >= this.config.burstRefillRate) {
                this.tokens = Math.min(this.config.burstSize, this.tokens + 1);
                this.lastRefill = now;
                
                // Process queue if we have tokens and queued requests
                if (this.tokens > 0 && this.queue.length > 0 && !this.isProcessingQueue) {
                    this._processQueue();
                }
            }
        }, this.config.burstRefillRate);
    }

    /**
     * Get current rate limit status
     * @returns {Object} Rate limit status
     */
    getStatus() {
        const now = Date.now();
        this._cleanOldRequests(now);
        
        const periods = [
            { name: 'second', period: 1000, limit: this.config.requestsPerSecond },
            { name: 'minute', period: 60000, limit: this.config.requestsPerMinute },
            { name: 'hour', period: 3600000, limit: this.config.requestsPerHour },
            { name: 'day', period: 86400000, limit: this.config.requestsPerDay }
        ];
        
        const usage = {};
        for (const { name, period, limit } of periods) {
            const recentRequests = this.requests.filter(time => now - time < period);
            usage[name] = {
                used: recentRequests.length,
                limit: limit,
                remaining: Math.max(0, limit - recentRequests.length),
                percentage: (recentRequests.length / limit) * 100
            };
        }
        
        return {
            usage,
            tokens: this.tokens,
            maxTokens: this.config.burstSize,
            queueSize: this.queue.length,
            maxQueueSize: this.config.maxQueueSize,
            canMakeRequest: this._canMakeRequestNow(),
            isProcessingQueue: this.isProcessingQueue
        };
    }

    /**
     * Get time until next request can be made
     * @returns {number} Time in milliseconds
     */
    getTimeUntilNextRequest() {
        if (this._canMakeRequestNow()) {
            return 0;
        }
        
        const now = Date.now();
        const periods = [
            { period: 1000, limit: this.config.requestsPerSecond },
            { period: 60000, limit: this.config.requestsPerMinute },
            { period: 3600000, limit: this.config.requestsPerHour },
            { period: 86400000, limit: this.config.requestsPerDay }
        ];
        
        let maxWaitTime = 0;
        
        for (const { period, limit } of periods) {
            const recentRequests = this.requests.filter(time => now - time < period);
            if (recentRequests.length >= limit) {
                const oldestRequest = Math.min(...recentRequests);
                const waitTime = period - (now - oldestRequest);
                maxWaitTime = Math.max(maxWaitTime, waitTime);
            }
        }
        
        // Also consider token refill time
        if (this.tokens <= 0) {
            const tokenWaitTime = this.config.burstRefillRate - (now - this.lastRefill);
            maxWaitTime = Math.max(maxWaitTime, tokenWaitTime);
        }
        
        return maxWaitTime;
    }

    /**
     * Reset rate limiter
     */
    reset() {
        this.requests = [];
        this.queue.forEach(request => {
            clearTimeout(request.timeout);
            request.reject(new Error('Rate limiter reset'));
        });
        this.queue = [];
        this.tokens = this.config.burstSize;
        this.lastRefill = Date.now();
        this.isProcessingQueue = false;
        
        log('debug', 'Rate limiter reset');
    }

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Reset tokens if burst size changed
        if (newConfig.burstSize !== undefined) {
            this.tokens = Math.min(this.tokens, this.config.burstSize);
        }
        
        log('debug', 'Rate limiter configuration updated', this.config);
    }

    /**
     * Get statistics
     * @returns {Object} Usage statistics
     */
    getStatistics() {
        const now = Date.now();
        const oneHour = 3600000;
        const recentRequests = this.requests.filter(time => now - time < oneHour);
        
        return {
            totalRequests: this.requests.length,
            recentRequests: recentRequests.length,
            averageRequestsPerMinute: recentRequests.length / 60,
            queuedRequests: this.queue.length,
            tokensUsed: this.config.burstSize - this.tokens,
            uptime: now - (this.requests[0] || now)
        };
    }
}

/**
 * Quota Manager for tracking API usage limits
 */
export class QuotaManager {
    constructor(config = {}) {
        this.config = {
            dailyLimit: config.dailyLimit || 10000,
            monthlyLimit: config.monthlyLimit || 100000,
            enableWarnings: config.enableWarnings !== false,
            warningThresholds: config.warningThresholds || [0.8, 0.9, 0.95],
            ...config
        };
        
        this.usage = {
            daily: 0,
            monthly: 0,
            lastReset: {
                daily: this._getStartOfDay(),
                monthly: this._getStartOfMonth()
            }
        };
        
        this.warningsIssued = new Set();
    }

    /**
     * Record API usage
     * @param {number} count - Number of requests to record
     */
    recordUsage(count = 1) {
        this._resetIfNeeded();
        
        this.usage.daily += count;
        this.usage.monthly += count;
        
        this._checkWarnings();
        
        log('debug', `Quota usage recorded: ${count} requests. Daily: ${this.usage.daily}/${this.config.dailyLimit}, Monthly: ${this.usage.monthly}/${this.config.monthlyLimit}`);
    }

    /**
     * Check if usage is within limits
     * @param {number} requestCount - Number of requests to check
     * @returns {Object} Quota check result
     */
    checkQuota(requestCount = 1) {
        this._resetIfNeeded();
        
        const dailyRemaining = this.config.dailyLimit - this.usage.daily;
        const monthlyRemaining = this.config.monthlyLimit - this.usage.monthly;
        
        const canProceed = dailyRemaining >= requestCount && monthlyRemaining >= requestCount;
        
        return {
            canProceed,
            dailyUsage: this.usage.daily,
            dailyLimit: this.config.dailyLimit,
            dailyRemaining,
            monthlyUsage: this.usage.monthly,
            monthlyLimit: this.config.monthlyLimit,
            monthlyRemaining,
            limitingFactor: dailyRemaining < monthlyRemaining ? 'daily' : 'monthly'
        };
    }

    /**
     * Get quota status
     * @returns {Object} Current quota status
     */
    getStatus() {
        this._resetIfNeeded();
        
        return {
            daily: {
                used: this.usage.daily,
                limit: this.config.dailyLimit,
                remaining: this.config.dailyLimit - this.usage.daily,
                percentage: (this.usage.daily / this.config.dailyLimit) * 100
            },
            monthly: {
                used: this.usage.monthly,
                limit: this.config.monthlyLimit,
                remaining: this.config.monthlyLimit - this.usage.monthly,
                percentage: (this.usage.monthly / this.config.monthlyLimit) * 100
            },
            lastReset: this.usage.lastReset
        };
    }

    /**
     * Reset quotas if needed
     * @private
     */
    _resetIfNeeded() {
        const now = Date.now();
        const startOfDay = this._getStartOfDay();
        const startOfMonth = this._getStartOfMonth();
        
        // Reset daily quota
        if (startOfDay > this.usage.lastReset.daily) {
            this.usage.daily = 0;
            this.usage.lastReset.daily = startOfDay;
            this.warningsIssued.clear();
            log('info', 'Daily quota reset');
        }
        
        // Reset monthly quota
        if (startOfMonth > this.usage.lastReset.monthly) {
            this.usage.monthly = 0;
            this.usage.lastReset.monthly = startOfMonth;
            this.warningsIssued.clear();
            log('info', 'Monthly quota reset');
        }
    }

    /**
     * Check and issue warnings if needed
     * @private
     */
    _checkWarnings() {
        if (!this.config.enableWarnings) return;
        
        const dailyPercentage = this.usage.daily / this.config.dailyLimit;
        const monthlyPercentage = this.usage.monthly / this.config.monthlyLimit;
        
        for (const threshold of this.config.warningThresholds) {
            const dailyKey = `daily_${threshold}`;
            const monthlyKey = `monthly_${threshold}`;
            
            if (dailyPercentage >= threshold && !this.warningsIssued.has(dailyKey)) {
                log('warning', `Daily quota warning: ${(dailyPercentage * 100).toFixed(1)}% used (${this.usage.daily}/${this.config.dailyLimit})`);
                this.warningsIssued.add(dailyKey);
            }
            
            if (monthlyPercentage >= threshold && !this.warningsIssued.has(monthlyKey)) {
                log('warning', `Monthly quota warning: ${(monthlyPercentage * 100).toFixed(1)}% used (${this.usage.monthly}/${this.config.monthlyLimit})`);
                this.warningsIssued.add(monthlyKey);
            }
        }
    }

    /**
     * Get start of current day
     * @returns {number} Timestamp
     * @private
     */
    _getStartOfDay() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }

    /**
     * Get start of current month
     * @returns {number} Timestamp
     * @private
     */
    _getStartOfMonth() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }
}

export default RateLimiter;

