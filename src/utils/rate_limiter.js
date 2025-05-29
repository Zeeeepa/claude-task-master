/**
 * Rate Limiter with Queue Support
 * Handles request rate limiting with queuing when limits are exceeded
 */
class RateLimiter {
    constructor(maxRequests = 10, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
        this.queue = [];
        this.processing = false;
    }

    /**
     * Acquire a slot for making a request
     * @returns {Promise<void>}
     */
    async acquire() {
        return new Promise((resolve) => {
            this.queue.push(resolve);
            this.processQueue();
        });
    }

    /**
     * Process the queue of pending requests
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            // Clean up old requests outside the window
            this.cleanupOldRequests();

            if (this.requests.length < this.maxRequests) {
                // We have capacity, process the next request
                const resolve = this.queue.shift();
                this.requests.push(Date.now());
                resolve();
            } else {
                // We're at capacity, wait until the oldest request expires
                const oldestRequest = this.requests[0];
                const waitTime = this.windowMs - (Date.now() - oldestRequest);
                
                if (waitTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, Math.max(1, waitTime)));
                } else {
                    // If waitTime is 0 or negative, clean up and continue
                    this.cleanupOldRequests();
                }
            }
        }

        this.processing = false;
    }

    /**
     * Remove requests that are outside the current window
     */
    cleanupOldRequests() {
        const now = Date.now();
        this.requests = this.requests.filter(timestamp => 
            now - timestamp < this.windowMs
        );
    }

    /**
     * Get current status of the rate limiter
     * @returns {Object} Status information
     */
    getStatus() {
        this.cleanupOldRequests();
        return {
            currentRequests: this.requests.length,
            maxRequests: this.maxRequests,
            queueLength: this.queue.length,
            windowMs: this.windowMs,
            available: this.maxRequests - this.requests.length
        };
    }

    /**
     * Reset the rate limiter
     */
    reset() {
        this.requests = [];
        // Clear queue by resolving all pending promises
        while (this.queue.length > 0) {
            const resolve = this.queue.shift();
            resolve();
        }
        this.processing = false;
    }

    /**
     * Check if a request can be made immediately
     * @returns {boolean}
     */
    canMakeRequest() {
        this.cleanupOldRequests();
        return this.requests.length < this.maxRequests;
    }
}

export default RateLimiter;
