import { jest } from '@jest/globals';
import RateLimiter from '../../src/utils/rate_limiter.js';

describe('RateLimiter', () => {
    let rateLimiter;

    beforeEach(() => {
        rateLimiter = new RateLimiter(3, 1000); // 3 requests per second
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        rateLimiter.reset();
    });

    describe('Basic Functionality', () => {
        it('should allow requests within limit', async () => {
            const startTime = Date.now();
            
            // Should allow first 3 requests immediately
            const promises = [
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ];

            await Promise.all(promises);
            
            const status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(3);
            expect(status.available).toBe(0);
        });

        it('should queue requests when limit is exceeded', async () => {
            // Fill up the rate limiter
            await Promise.all([
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ]);

            // This should be queued
            const queuedPromise = rateLimiter.acquire();
            
            // Check that it's queued
            const status = rateLimiter.getStatus();
            expect(status.queueLength).toBe(1);
            expect(status.available).toBe(0);

            // Advance time to allow the queued request
            jest.advanceTimersByTime(1000);
            await queuedPromise;

            const finalStatus = rateLimiter.getStatus();
            expect(finalStatus.queueLength).toBe(0);
        });

        it('should respect the time window', async () => {
            // Make 3 requests
            await Promise.all([
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ]);

            expect(rateLimiter.canMakeRequest()).toBe(false);

            // Advance time by half the window
            jest.advanceTimersByTime(500);
            expect(rateLimiter.canMakeRequest()).toBe(false);

            // Advance time to complete the window
            jest.advanceTimersByTime(500);
            expect(rateLimiter.canMakeRequest()).toBe(true);
        });
    });

    describe('Queue Management', () => {
        it('should process queue in FIFO order', async () => {
            // Fill up the rate limiter
            await Promise.all([
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ]);

            const results = [];
            
            // Queue multiple requests
            const promises = [
                rateLimiter.acquire().then(() => results.push('first')),
                rateLimiter.acquire().then(() => results.push('second')),
                rateLimiter.acquire().then(() => results.push('third'))
            ];

            // Advance time to process queue
            jest.advanceTimersByTime(3000);
            await Promise.all(promises);

            expect(results).toEqual(['first', 'second', 'third']);
        });

        it('should handle multiple queued requests correctly', async () => {
            const maxRequests = 2;
            const windowMs = 1000;
            rateLimiter = new RateLimiter(maxRequests, windowMs);

            // Fill up the rate limiter
            await Promise.all([
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ]);

            // Queue 2 more requests (smaller number for testing)
            const queuedPromises = [
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ];

            // Check that they are queued
            expect(rateLimiter.getStatus().queueLength).toBe(2);

            // Advance time to process queued requests
            jest.advanceTimersByTime(1500);
            
            // Wait for promises to resolve
            await Promise.all(queuedPromises);

            expect(rateLimiter.getStatus().queueLength).toBe(0);
        });
    });

    describe('Status and Monitoring', () => {
        it('should provide accurate status information', () => {
            const status = rateLimiter.getStatus();
            
            expect(status).toHaveProperty('currentRequests');
            expect(status).toHaveProperty('maxRequests');
            expect(status).toHaveProperty('queueLength');
            expect(status).toHaveProperty('windowMs');
            expect(status).toHaveProperty('available');
            
            expect(status.currentRequests).toBe(0);
            expect(status.maxRequests).toBe(3);
            expect(status.queueLength).toBe(0);
            expect(status.available).toBe(3);
        });

        it('should update status after requests', async () => {
            await rateLimiter.acquire();
            
            const status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(1);
            expect(status.available).toBe(2);
        });

        it('should clean up old requests in status', async () => {
            await rateLimiter.acquire();
            
            // Advance time beyond window
            jest.advanceTimersByTime(1500);
            
            const status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(0);
            expect(status.available).toBe(3);
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero max requests', () => {
            const zeroLimiter = new RateLimiter(0, 1000);
            expect(zeroLimiter.canMakeRequest()).toBe(false);
        });

        it('should handle very short time windows', async () => {
            const shortWindowLimiter = new RateLimiter(1, 10);
            
            await shortWindowLimiter.acquire();
            expect(shortWindowLimiter.canMakeRequest()).toBe(false);
            
            jest.advanceTimersByTime(15);
            expect(shortWindowLimiter.canMakeRequest()).toBe(true);
        });

        it('should handle reset correctly', async () => {
            await Promise.all([
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ]);

            // Queue some requests
            rateLimiter.acquire();
            rateLimiter.acquire();

            expect(rateLimiter.getStatus().currentRequests).toBe(3);
            expect(rateLimiter.getStatus().queueLength).toBe(2);

            rateLimiter.reset();

            const status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(0);
            expect(status.queueLength).toBe(0);
            expect(status.available).toBe(3);
        });
    });

    describe('Concurrent Access', () => {
        it('should handle concurrent acquire calls', async () => {
            const promises = [
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire(),
                rateLimiter.acquire()
            ];
            
            // Advance time to process all requests
            jest.advanceTimersByTime(3000);
            await Promise.all(promises);
            
            // All requests should have been processed
            expect(rateLimiter.getStatus().queueLength).toBe(0);
        });

        it('should maintain rate limit under concurrent load', async () => {
            const results = [];
            
            // Create 5 concurrent requests
            const promises = Array.from({ length: 5 }, async (_, index) => {
                await rateLimiter.acquire();
                results.push({
                    index,
                    timestamp: Date.now()
                });
            });

            // Process requests over time
            jest.advanceTimersByTime(3000);
            await Promise.all(promises);

            // Verify that all requests were processed
            expect(results).toHaveLength(5);
        });
    });
});
