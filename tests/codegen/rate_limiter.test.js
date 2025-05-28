/**
 * @fileoverview Tests for Rate Limiter
 * @description Comprehensive tests for rate limiting and quota management
 */

import { jest } from '@jest/globals';
import {
	RateLimiter,
	QuotaManager
} from '../../src/ai_cicd_system/core/rate_limiter.js';

// Mock timers for testing
jest.useFakeTimers();

describe('RateLimiter', () => {
	let rateLimiter;

	beforeEach(() => {
		rateLimiter = new RateLimiter({
			requestsPerSecond: 2,
			requestsPerMinute: 10,
			requestsPerHour: 100,
			burstSize: 5,
			burstRefillRate: 1000,
			enableQueue: true,
			maxQueueSize: 10
		});
		jest.clearAllTimers();
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
	});

	describe('constructor', () => {
		it('should initialize with default config', () => {
			const limiter = new RateLimiter();
			expect(limiter.config.requestsPerSecond).toBe(2);
			expect(limiter.config.requestsPerMinute).toBe(60);
			expect(limiter.tokens).toBe(5); // default burst size
		});

		it('should use provided config', () => {
			const config = {
				requestsPerSecond: 5,
				requestsPerMinute: 30,
				burstSize: 10
			};
			const limiter = new RateLimiter(config);
			expect(limiter.config.requestsPerSecond).toBe(5);
			expect(limiter.config.requestsPerMinute).toBe(30);
			expect(limiter.tokens).toBe(10);
		});
	});

	describe('acquire', () => {
		it('should allow requests within limits', async () => {
			const promise = rateLimiter.acquire();
			await expect(promise).resolves.toBeUndefined();
		});

		it('should consume tokens', async () => {
			const initialTokens = rateLimiter.tokens;
			await rateLimiter.acquire();
			expect(rateLimiter.tokens).toBe(initialTokens - 1);
		});

		it('should queue requests when limits exceeded', async () => {
			// Exhaust all tokens
			for (let i = 0; i < 5; i++) {
				await rateLimiter.acquire();
			}

			// Next request should be queued
			const promise = rateLimiter.acquire();
			expect(rateLimiter.queue.length).toBe(1);

			// Resolve by advancing time to refill tokens
			jest.advanceTimersByTime(1000);
			await promise;
		});

		it('should respect priority in queue', async () => {
			// Exhaust tokens
			for (let i = 0; i < 5; i++) {
				await rateLimiter.acquire();
			}

			const results = [];

			// Add requests with different priorities
			rateLimiter.acquire({ priority: 'low' }).then(() => results.push('low'));
			rateLimiter
				.acquire({ priority: 'normal' })
				.then(() => results.push('normal'));
			rateLimiter
				.acquire({ priority: 'high' })
				.then(() => results.push('high'));

			// Advance time to process queue
			jest.advanceTimersByTime(3000);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(results).toEqual(['high', 'normal', 'low']);
		});

		it('should timeout requests', async () => {
			// Exhaust tokens
			for (let i = 0; i < 5; i++) {
				await rateLimiter.acquire();
			}

			const promise = rateLimiter.acquire({ timeout: 1000 });

			jest.advanceTimersByTime(1000);

			await expect(promise).rejects.toThrow('Rate limiter timeout');
		});

		it('should reject when queue is full', async () => {
			// Exhaust tokens
			for (let i = 0; i < 5; i++) {
				await rateLimiter.acquire();
			}

			// Fill queue
			for (let i = 0; i < 10; i++) {
				rateLimiter.acquire().catch(() => {}); // Ignore rejections
			}

			// Next request should be rejected
			await expect(rateLimiter.acquire()).rejects.toThrow(
				'Rate limit exceeded and queue is full'
			);
		});
	});

	describe('_canMakeRequestNow', () => {
		it('should return true when within all limits', () => {
			expect(rateLimiter._canMakeRequestNow()).toBe(true);
		});

		it('should return false when tokens exhausted', () => {
			rateLimiter.tokens = 0;
			expect(rateLimiter._canMakeRequestNow()).toBe(false);
		});

		it('should return false when rate limits exceeded', () => {
			// Simulate requests in the last second
			const now = Date.now();
			rateLimiter.requests = [now - 500, now - 200];

			expect(rateLimiter._canMakeRequestNow()).toBe(false);
		});
	});

	describe('_calculateDelay', () => {
		it('should calculate linear backoff', () => {
			rateLimiter.config.backoffStrategy = 'linear';
			rateLimiter.config.baseDelay = 1000;
			rateLimiter.queue = new Array(3); // 3 items in queue

			const delay = rateLimiter._calculateDelay();
			expect(delay).toBe(3000); // 1000 * 3
		});

		it('should calculate exponential backoff', () => {
			rateLimiter.config.backoffStrategy = 'exponential';
			rateLimiter.config.baseDelay = 1000;
			rateLimiter.queue = new Array(3); // 3 items in queue

			const delay = rateLimiter._calculateDelay();
			expect(delay).toBe(8000); // 1000 * 2^3
		});

		it('should use fixed delay', () => {
			rateLimiter.config.backoffStrategy = 'fixed';
			rateLimiter.config.baseDelay = 1000;
			rateLimiter.queue = new Array(10); // Many items in queue

			const delay = rateLimiter._calculateDelay();
			expect(delay).toBe(1000); // Always base delay
		});

		it('should respect max delay', () => {
			rateLimiter.config.backoffStrategy = 'exponential';
			rateLimiter.config.baseDelay = 1000;
			rateLimiter.config.maxDelay = 5000;
			rateLimiter.queue = new Array(10); // Would cause very large delay

			const delay = rateLimiter._calculateDelay();
			expect(delay).toBe(5000); // Capped at max delay
		});
	});

	describe('getStatus', () => {
		it('should return comprehensive status', () => {
			const status = rateLimiter.getStatus();

			expect(status).toHaveProperty('usage');
			expect(status).toHaveProperty('tokens');
			expect(status).toHaveProperty('maxTokens');
			expect(status).toHaveProperty('queueSize');
			expect(status).toHaveProperty('canMakeRequest');

			expect(status.usage).toHaveProperty('second');
			expect(status.usage).toHaveProperty('minute');
			expect(status.usage).toHaveProperty('hour');
			expect(status.usage).toHaveProperty('day');
		});

		it('should calculate usage percentages', () => {
			// Add some requests
			rateLimiter.requests = [Date.now() - 500, Date.now() - 1500];

			const status = rateLimiter.getStatus();

			expect(status.usage.second.used).toBe(1);
			expect(status.usage.second.percentage).toBe(50); // 1/2 * 100
		});
	});

	describe('getTimeUntilNextRequest', () => {
		it('should return 0 when request can be made immediately', () => {
			const time = rateLimiter.getTimeUntilNextRequest();
			expect(time).toBe(0);
		});

		it('should calculate wait time based on rate limits', () => {
			// Exhaust per-second limit
			const now = Date.now();
			rateLimiter.requests = [now - 500, now - 200];

			const time = rateLimiter.getTimeUntilNextRequest();
			expect(time).toBeGreaterThan(0);
		});

		it('should consider token refill time', () => {
			rateLimiter.tokens = 0;
			rateLimiter.lastRefill = Date.now() - 500; // 500ms since last refill

			const time = rateLimiter.getTimeUntilNextRequest();
			expect(time).toBe(500); // 1000ms refill rate - 500ms elapsed
		});
	});

	describe('reset', () => {
		it('should reset all state', () => {
			// Add some state
			rateLimiter.requests = [Date.now()];
			rateLimiter.tokens = 0;
			rateLimiter.queue.push({ resolve: jest.fn(), reject: jest.fn() });

			rateLimiter.reset();

			expect(rateLimiter.requests).toEqual([]);
			expect(rateLimiter.tokens).toBe(rateLimiter.config.burstSize);
			expect(rateLimiter.queue).toEqual([]);
		});

		it('should reject queued requests', () => {
			const rejectFn = jest.fn();
			rateLimiter.queue.push({
				resolve: jest.fn(),
				reject: rejectFn,
				timeout: setTimeout(() => {}, 1000)
			});

			rateLimiter.reset();

			expect(rejectFn).toHaveBeenCalledWith(new Error('Rate limiter reset'));
		});
	});

	describe('updateConfig', () => {
		it('should update configuration', () => {
			rateLimiter.updateConfig({ requestsPerSecond: 10 });
			expect(rateLimiter.config.requestsPerSecond).toBe(10);
		});

		it('should adjust tokens when burst size changes', () => {
			rateLimiter.tokens = 3;
			rateLimiter.updateConfig({ burstSize: 2 });
			expect(rateLimiter.tokens).toBe(2); // Capped at new burst size
		});
	});

	describe('getStatistics', () => {
		it('should return usage statistics', () => {
			// Add some requests
			rateLimiter.requests = [Date.now() - 1000, Date.now() - 2000];
			rateLimiter.tokens = 3;

			const stats = rateLimiter.getStatistics();

			expect(stats).toHaveProperty('totalRequests');
			expect(stats).toHaveProperty('recentRequests');
			expect(stats).toHaveProperty('averageRequestsPerMinute');
			expect(stats).toHaveProperty('queuedRequests');
			expect(stats).toHaveProperty('tokensUsed');
			expect(stats.tokensUsed).toBe(2); // 5 - 3
		});
	});
});

describe('QuotaManager', () => {
	let quotaManager;

	beforeEach(() => {
		quotaManager = new QuotaManager({
			dailyLimit: 100,
			monthlyLimit: 1000,
			enableWarnings: true,
			warningThresholds: [0.8, 0.9]
		});
	});

	describe('constructor', () => {
		it('should initialize with default config', () => {
			const manager = new QuotaManager();
			expect(manager.config.dailyLimit).toBe(10000);
			expect(manager.config.monthlyLimit).toBe(100000);
		});

		it('should use provided config', () => {
			const config = { dailyLimit: 500, monthlyLimit: 5000 };
			const manager = new QuotaManager(config);
			expect(manager.config.dailyLimit).toBe(500);
			expect(manager.config.monthlyLimit).toBe(5000);
		});
	});

	describe('recordUsage', () => {
		it('should record single request', () => {
			quotaManager.recordUsage();
			expect(quotaManager.usage.daily).toBe(1);
			expect(quotaManager.usage.monthly).toBe(1);
		});

		it('should record multiple requests', () => {
			quotaManager.recordUsage(5);
			expect(quotaManager.usage.daily).toBe(5);
			expect(quotaManager.usage.monthly).toBe(5);
		});

		it('should trigger warnings at thresholds', () => {
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

			// Use 80% of daily quota (80 requests)
			quotaManager.recordUsage(80);

			// Should have triggered warning
			expect(quotaManager.warningsIssued.has('daily_0.8')).toBe(true);

			consoleSpy.mockRestore();
		});
	});

	describe('checkQuota', () => {
		it('should allow requests within limits', () => {
			const result = quotaManager.checkQuota(10);

			expect(result.canProceed).toBe(true);
			expect(result.dailyRemaining).toBe(100);
			expect(result.monthlyRemaining).toBe(1000);
		});

		it('should deny requests exceeding daily limit', () => {
			quotaManager.usage.daily = 95;

			const result = quotaManager.checkQuota(10);

			expect(result.canProceed).toBe(false);
			expect(result.limitingFactor).toBe('daily');
		});

		it('should deny requests exceeding monthly limit', () => {
			quotaManager.usage.monthly = 995;

			const result = quotaManager.checkQuota(10);

			expect(result.canProceed).toBe(false);
			expect(result.limitingFactor).toBe('monthly');
		});

		it('should identify limiting factor correctly', () => {
			quotaManager.usage.daily = 90;
			quotaManager.usage.monthly = 50;

			const result = quotaManager.checkQuota(5);

			expect(result.limitingFactor).toBe('daily');
		});
	});

	describe('getStatus', () => {
		it('should return comprehensive status', () => {
			quotaManager.usage.daily = 25;
			quotaManager.usage.monthly = 150;

			const status = quotaManager.getStatus();

			expect(status.daily.used).toBe(25);
			expect(status.daily.remaining).toBe(75);
			expect(status.daily.percentage).toBe(25);

			expect(status.monthly.used).toBe(150);
			expect(status.monthly.remaining).toBe(850);
			expect(status.monthly.percentage).toBe(15);
		});
	});

	describe('_resetIfNeeded', () => {
		it('should reset daily quota at start of new day', () => {
			quotaManager.usage.daily = 50;
			quotaManager.usage.lastReset.daily = Date.now() - 86400000 - 1000; // Over a day ago

			quotaManager._resetIfNeeded();

			expect(quotaManager.usage.daily).toBe(0);
		});

		it('should reset monthly quota at start of new month', () => {
			quotaManager.usage.monthly = 500;
			quotaManager.usage.lastReset.monthly = Date.now() - 86400000 * 32; // Over a month ago

			quotaManager._resetIfNeeded();

			expect(quotaManager.usage.monthly).toBe(0);
		});

		it('should not reset if not needed', () => {
			quotaManager.usage.daily = 50;
			quotaManager.usage.monthly = 500;

			quotaManager._resetIfNeeded();

			expect(quotaManager.usage.daily).toBe(50);
			expect(quotaManager.usage.monthly).toBe(500);
		});
	});

	describe('_checkWarnings', () => {
		it('should issue warnings at configured thresholds', () => {
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

			// Trigger 80% warning
			quotaManager.usage.daily = 80;
			quotaManager._checkWarnings();

			expect(quotaManager.warningsIssued.has('daily_0.8')).toBe(true);

			// Trigger 90% warning
			quotaManager.usage.daily = 90;
			quotaManager._checkWarnings();

			expect(quotaManager.warningsIssued.has('daily_0.9')).toBe(true);

			consoleSpy.mockRestore();
		});

		it('should not issue duplicate warnings', () => {
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

			quotaManager.usage.daily = 80;
			quotaManager._checkWarnings();
			quotaManager._checkWarnings(); // Call again

			// Should only be called once
			expect(consoleSpy).toHaveBeenCalledTimes(1);

			consoleSpy.mockRestore();
		});

		it('should not issue warnings when disabled', () => {
			quotaManager.config.enableWarnings = false;
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

			quotaManager.usage.daily = 90;
			quotaManager._checkWarnings();

			expect(consoleSpy).not.toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});

	describe('_getStartOfDay', () => {
		it('should return start of current day', () => {
			const startOfDay = quotaManager._getStartOfDay();
			const now = new Date();
			const expected = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate()
			).getTime();

			expect(startOfDay).toBe(expected);
		});
	});

	describe('_getStartOfMonth', () => {
		it('should return start of current month', () => {
			const startOfMonth = quotaManager._getStartOfMonth();
			const now = new Date();
			const expected = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

			expect(startOfMonth).toBe(expected);
		});
	});
});
