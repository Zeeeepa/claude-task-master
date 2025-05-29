/**
 * @fileoverview Unified Rate Limit Manager
 * @description Consolidated rate limiting from PRs #52, #54, #87
 */

import { EventEmitter } from 'events';
import { log } from '../../../utils/logger.js';

/**
 * Unified Rate Limit Manager
 * Handles API rate limiting with multiple strategies
 */
export class RateLimitManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            requestsPerSecond: config.requestsPerSecond || 2,
            requestsPerMinute: config.requestsPerMinute || 60,
            requestsPerHour: config.requestsPerHour || 1000,
            strategy: config.strategy || 'sliding_window',
            backoffMultiplier: config.backoffMultiplier || 2,
            maxBackoffTime: config.maxBackoffTime || 30000,
            queueSize: config.queueSize || 100,
            ...config
        };

        this.requestHistory = [];
        this.queue = [];
        this.isProcessing = false;
        
        log('debug', 'Rate Limit Manager initialized', {
            enabled: this.config.enabled,
            strategy: this.config.strategy,
            rps: this.config.requestsPerSecond
        });
    }

    async acquire() {
        if (!this.config.enabled) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            if (this.queue.length >= this.config.queueSize) {
                reject(new Error('Rate limit queue full'));
                return;
            }

            this.queue.push({ resolve, reject, timestamp: Date.now() });
            this._processQueue();
        });
    }

    getStatus() {
        return {
            enabled: this.config.enabled,
            queueLength: this.queue.length,
            requestsInLastMinute: this._getRequestsInWindow(60000),
            requestsInLastHour: this._getRequestsInWindow(3600000)
        };
    }

    healthCheck() {
        return {
            status: 'healthy',
            queueLength: this.queue.length,
            enabled: this.config.enabled
        };
    }

    isEnabled() {
        return this.config.enabled;
    }

    async _processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            if (this._canMakeRequest()) {
                const request = this.queue.shift();
                this._recordRequest();
                request.resolve();
            } else {
                const delay = this._calculateDelay();
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        this.isProcessing = false;
    }

    _canMakeRequest() {
        const now = Date.now();
        
        // Check per-second limit
        const requestsInLastSecond = this._getRequestsInWindow(1000);
        if (requestsInLastSecond >= this.config.requestsPerSecond) {
            return false;
        }

        // Check per-minute limit
        const requestsInLastMinute = this._getRequestsInWindow(60000);
        if (requestsInLastMinute >= this.config.requestsPerMinute) {
            return false;
        }

        // Check per-hour limit
        const requestsInLastHour = this._getRequestsInWindow(3600000);
        if (requestsInLastHour >= this.config.requestsPerHour) {
            return false;
        }

        return true;
    }

    _getRequestsInWindow(windowMs) {
        const now = Date.now();
        return this.requestHistory.filter(timestamp => 
            now - timestamp < windowMs
        ).length;
    }

    _recordRequest() {
        const now = Date.now();
        this.requestHistory.push(now);
        
        // Clean old entries (keep last hour)
        this.requestHistory = this.requestHistory.filter(timestamp => 
            now - timestamp < 3600000
        );
    }

    _calculateDelay() {
        // Simple delay calculation - wait until next second
        return 1000;
    }
}

