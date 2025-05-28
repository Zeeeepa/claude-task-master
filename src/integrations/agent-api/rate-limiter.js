/**
 * Rate Limiter
 *
 * Implements intelligent rate limiting and throttling for the AgentAPI middleware.
 * Prevents API abuse and ensures fair resource allocation.
 */

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { SimpleLogger } from '../../ai_cicd_system/utils/simple_logger.js';

export class RateLimiter {
	constructor(config = {}) {
		this.config = {
			// Global rate limiting
			windowMs: config.windowMs || 15 * 60 * 1000, // 15 minutes
			maxRequests: config.maxRequests || 100,

			// Per-endpoint rate limiting
			authWindowMs: config.authWindowMs || 15 * 60 * 1000, // 15 minutes
			authMaxRequests: config.authMaxRequests || 10,

			// API endpoint rate limiting
			apiWindowMs: config.apiWindowMs || 1 * 60 * 1000, // 1 minute
			apiMaxRequests: config.apiMaxRequests || 60,

			// Slow down configuration
			slowDownWindowMs: config.slowDownWindowMs || 15 * 60 * 1000, // 15 minutes
			slowDownDelayAfter: config.slowDownDelayAfter || 50,
			slowDownDelayMs: config.slowDownDelayMs || 500,
			slowDownMaxDelayMs: config.slowDownMaxDelayMs || 20000,

			// Skip configuration
			skipSuccessfulRequests: config.skipSuccessfulRequests || false,
			skipFailedRequests: config.skipFailedRequests || false,

			// Custom key generator
			keyGenerator: config.keyGenerator,

			// Trust proxy
			trustProxy: config.trustProxy !== false,

			...config
		};

		this.logger = new SimpleLogger('RateLimiter');

		// Store for custom rate limiting logic
		this.requestCounts = new Map();
		this.userLimits = new Map();

		this._setupLimiters();
	}

	/**
	 * Setup rate limiters
	 */
	_setupLimiters() {
		// Global rate limiter
		this.globalLimiter = rateLimit({
			windowMs: this.config.windowMs,
			max: this.config.maxRequests,
			message: {
				error: 'Too Many Requests',
				message: 'Too many requests from this IP, please try again later.',
				retryAfter: Math.ceil(this.config.windowMs / 1000)
			},
			standardHeaders: true,
			legacyHeaders: false,
			keyGenerator:
				this.config.keyGenerator || this._defaultKeyGenerator.bind(this),
			skip: this._shouldSkipRequest.bind(this),
			onLimitReached: this._onLimitReached.bind(this)
		});

		// Authentication rate limiter (stricter)
		this.authLimiter = rateLimit({
			windowMs: this.config.authWindowMs,
			max: this.config.authMaxRequests,
			message: {
				error: 'Too Many Authentication Attempts',
				message: 'Too many authentication attempts, please try again later.',
				retryAfter: Math.ceil(this.config.authWindowMs / 1000)
			},
			standardHeaders: true,
			legacyHeaders: false,
			keyGenerator: this._authKeyGenerator.bind(this),
			onLimitReached: (req, res, options) => {
				this.logger.warn(`Auth rate limit exceeded for ${req.ip}`, {
					ip: req.ip,
					userAgent: req.get('User-Agent'),
					path: req.path
				});
			}
		});

		// API endpoint rate limiter
		this.apiLimiter = rateLimit({
			windowMs: this.config.apiWindowMs,
			max: this.config.apiMaxRequests,
			message: {
				error: 'API Rate Limit Exceeded',
				message: 'API rate limit exceeded, please slow down your requests.',
				retryAfter: Math.ceil(this.config.apiWindowMs / 1000)
			},
			standardHeaders: true,
			legacyHeaders: false,
			keyGenerator: this._apiKeyGenerator.bind(this),
			skip: (req) => {
				// Skip rate limiting for health checks
				return req.path === '/health' || req.path === '/';
			}
		});

		// Slow down middleware
		this.slowDownLimiter = slowDown({
			windowMs: this.config.slowDownWindowMs,
			delayAfter: this.config.slowDownDelayAfter,
			delayMs: this.config.slowDownDelayMs,
			maxDelayMs: this.config.slowDownMaxDelayMs,
			keyGenerator:
				this.config.keyGenerator || this._defaultKeyGenerator.bind(this),
			skip: this._shouldSkipRequest.bind(this),
			onLimitReached: (req, res, options) => {
				this.logger.info(`Slow down activated for ${req.ip}`, {
					ip: req.ip,
					delay: options.delay,
					path: req.path
				});
			}
		});
	}

	/**
	 * Default key generator (IP-based)
	 */
	_defaultKeyGenerator(req) {
		return req.ip;
	}

	/**
	 * Authentication key generator (IP + User-Agent)
	 */
	_authKeyGenerator(req) {
		const userAgent = req.get('User-Agent') || 'unknown';
		return `${req.ip}:${userAgent.substring(0, 50)}`;
	}

	/**
	 * API key generator (User ID if authenticated, otherwise IP)
	 */
	_apiKeyGenerator(req) {
		if (req.user && req.user.id) {
			return `user:${req.user.id}`;
		}
		return `ip:${req.ip}`;
	}

	/**
	 * Check if request should be skipped
	 */
	_shouldSkipRequest(req) {
		// Skip internal health checks
		if (req.path === '/health' && req.ip === '127.0.0.1') {
			return true;
		}

		// Skip based on configuration
		if (
			this.config.skipSuccessfulRequests &&
			req.res &&
			req.res.statusCode < 400
		) {
			return true;
		}

		if (
			this.config.skipFailedRequests &&
			req.res &&
			req.res.statusCode >= 400
		) {
			return true;
		}

		return false;
	}

	/**
	 * Handle rate limit reached
	 */
	_onLimitReached(req, res, options) {
		this.logger.warn(`Rate limit exceeded`, {
			ip: req.ip,
			path: req.path,
			method: req.method,
			userAgent: req.get('User-Agent'),
			limit: options.max,
			windowMs: options.windowMs
		});

		// Track repeated violations
		const key = this._defaultKeyGenerator(req);
		const violations = this.requestCounts.get(key) || 0;
		this.requestCounts.set(key, violations + 1);

		// Implement progressive penalties for repeat offenders
		if (violations > 5) {
			this.logger.warn(`Repeat rate limit violator detected: ${key}`, {
				violations: violations + 1,
				ip: req.ip
			});
		}
	}

	/**
	 * Get middleware for specific endpoint type
	 */
	getMiddleware(type = 'global') {
		switch (type) {
			case 'auth':
				return this.authLimiter;
			case 'api':
				return this.apiLimiter;
			case 'slowdown':
				return this.slowDownLimiter;
			case 'global':
			default:
				return this.globalLimiter;
		}
	}

	/**
	 * Get combined middleware stack
	 */
	getCombinedMiddleware() {
		return [this.slowDownLimiter, this.globalLimiter];
	}

	/**
	 * Custom rate limiting middleware for specific users/roles
	 */
	customRateLimit(options = {}) {
		const {
			maxRequests = 100,
			windowMs = 15 * 60 * 1000,
			keyGenerator = this._defaultKeyGenerator.bind(this),
			condition = () => true
		} = options;

		return (req, res, next) => {
			if (!condition(req)) {
				return next();
			}

			const key = keyGenerator(req);
			const now = Date.now();
			const windowStart = now - windowMs;

			// Get or create request history for this key
			let requests = this.userLimits.get(key) || [];

			// Remove old requests outside the window
			requests = requests.filter((timestamp) => timestamp > windowStart);

			// Check if limit exceeded
			if (requests.length >= maxRequests) {
				this.logger.warn(`Custom rate limit exceeded for ${key}`, {
					requests: requests.length,
					maxRequests,
					windowMs
				});

				return res.status(429).json({
					error: 'Rate Limit Exceeded',
					message: 'Custom rate limit exceeded',
					retryAfter: Math.ceil(windowMs / 1000)
				});
			}

			// Add current request
			requests.push(now);
			this.userLimits.set(key, requests);

			next();
		};
	}

	/**
	 * Whitelist middleware - bypass rate limiting for specific IPs/users
	 */
	whitelist(identifiers = []) {
		const whitelistSet = new Set(identifiers);

		return (req, res, next) => {
			const ip = req.ip;
			const userId = req.user?.id;

			if (whitelistSet.has(ip) || (userId && whitelistSet.has(userId))) {
				// Skip rate limiting
				req.skipRateLimit = true;
			}

			next();
		};
	}

	/**
	 * Dynamic rate limiting based on system load
	 */
	adaptiveRateLimit() {
		return (req, res, next) => {
			const memoryUsage = process.memoryUsage();
			const cpuUsage = process.cpuUsage();

			// Calculate system load factor (simplified)
			const memoryLoadFactor = memoryUsage.heapUsed / memoryUsage.heapTotal;
			const loadFactor = memoryLoadFactor;

			// Adjust rate limits based on load
			if (loadFactor > 0.8) {
				// High load - reduce limits by 50%
				req.rateLimitFactor = 0.5;
				this.logger.warn('High system load detected, reducing rate limits', {
					loadFactor,
					memoryUsage: Math.round(memoryLoadFactor * 100) + '%'
				});
			} else if (loadFactor > 0.6) {
				// Medium load - reduce limits by 25%
				req.rateLimitFactor = 0.75;
			} else {
				// Normal load
				req.rateLimitFactor = 1.0;
			}

			next();
		};
	}

	/**
	 * Get rate limiting statistics
	 */
	getStats() {
		const stats = {
			globalLimiter: {
				windowMs: this.config.windowMs,
				maxRequests: this.config.maxRequests
			},
			authLimiter: {
				windowMs: this.config.authWindowMs,
				maxRequests: this.config.authMaxRequests
			},
			apiLimiter: {
				windowMs: this.config.apiWindowMs,
				maxRequests: this.config.apiMaxRequests
			},
			slowDown: {
				windowMs: this.config.slowDownWindowMs,
				delayAfter: this.config.slowDownDelayAfter,
				delayMs: this.config.slowDownDelayMs,
				maxDelayMs: this.config.slowDownMaxDelayMs
			},
			violations: this.requestCounts.size,
			customLimits: this.userLimits.size
		};

		return stats;
	}

	/**
	 * Reset rate limiting data for a specific key
	 */
	resetLimits(key) {
		this.requestCounts.delete(key);
		this.userLimits.delete(key);
		this.logger.info(`Rate limits reset for key: ${key}`);
	}

	/**
	 * Clear all rate limiting data
	 */
	clearAllLimits() {
		this.requestCounts.clear();
		this.userLimits.clear();
		this.logger.info('All rate limits cleared');
	}

	/**
	 * Get current request counts
	 */
	getCurrentCounts() {
		const counts = {};
		for (const [key, count] of this.requestCounts.entries()) {
			counts[key] = count;
		}
		return counts;
	}

	/**
	 * Cleanup expired entries (should be called periodically)
	 */
	cleanup() {
		const now = Date.now();
		const maxAge = Math.max(
			this.config.windowMs,
			this.config.authWindowMs,
			this.config.apiWindowMs,
			this.config.slowDownWindowMs
		);

		// Clean up user limits
		for (const [key, requests] of this.userLimits.entries()) {
			const validRequests = requests.filter(
				(timestamp) => now - timestamp < maxAge
			);
			if (validRequests.length === 0) {
				this.userLimits.delete(key);
			} else {
				this.userLimits.set(key, validRequests);
			}
		}

		// Clean up violation counts (keep for 24 hours)
		const violationMaxAge = 24 * 60 * 60 * 1000;
		// Note: express-rate-limit handles its own cleanup, we just track violations
		// In a production system, you'd want to store timestamps with violations

		this.logger.debug('Rate limiter cleanup completed');
	}
}

export default RateLimiter;
