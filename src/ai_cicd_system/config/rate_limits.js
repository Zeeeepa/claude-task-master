/**
 * @fileoverview Rate Limiting Configuration
 * @description Configuration for API rate limiting and quota management
 */

/**
 * Rate limiting configuration presets
 */
export const RateLimitPresets = {
    /**
     * Development environment settings
     */
    development: {
        enabled: true,
        requests: 50,
        window: 60000, // 1 minute
        strategy: 'sliding_window',
        backoffMultiplier: 1.5,
        maxBackoffTime: 10000,
        burstAllowance: 10,
        queueEnabled: true,
        maxQueueSize: 50
    },

    /**
     * Production environment settings
     */
    production: {
        enabled: true,
        requests: 100,
        window: 60000, // 1 minute
        strategy: 'sliding_window',
        backoffMultiplier: 2,
        maxBackoffTime: 30000,
        burstAllowance: 20,
        queueEnabled: true,
        maxQueueSize: 200
    },

    /**
     * Testing environment settings
     */
    testing: {
        enabled: false,
        requests: 1000,
        window: 60000,
        strategy: 'fixed_window',
        backoffMultiplier: 1,
        maxBackoffTime: 1000,
        burstAllowance: 100,
        queueEnabled: false,
        maxQueueSize: 0
    },

    /**
     * High-volume batch processing settings
     */
    batch: {
        enabled: true,
        requests: 30,
        window: 60000,
        strategy: 'sliding_window',
        backoffMultiplier: 3,
        maxBackoffTime: 60000,
        burstAllowance: 5,
        queueEnabled: true,
        maxQueueSize: 1000
    },

    /**
     * Interactive user sessions
     */
    interactive: {
        enabled: true,
        requests: 200,
        window: 60000,
        strategy: 'sliding_window',
        backoffMultiplier: 1.5,
        maxBackoffTime: 15000,
        burstAllowance: 50,
        queueEnabled: true,
        maxQueueSize: 100
    }
};

/**
 * Quota management configuration presets
 */
export const QuotaPresets = {
    /**
     * Free tier quotas
     */
    free: {
        enabled: true,
        dailyLimit: 100,
        monthlyLimit: 1000,
        warningThreshold: 0.8,
        trackUsage: true,
        resetTime: '00:00:00',
        timezone: 'UTC'
    },

    /**
     * Professional tier quotas
     */
    professional: {
        enabled: true,
        dailyLimit: 1000,
        monthlyLimit: 20000,
        warningThreshold: 0.85,
        trackUsage: true,
        resetTime: '00:00:00',
        timezone: 'UTC'
    },

    /**
     * Enterprise tier quotas
     */
    enterprise: {
        enabled: true,
        dailyLimit: 10000,
        monthlyLimit: 200000,
        warningThreshold: 0.9,
        trackUsage: true,
        resetTime: '00:00:00',
        timezone: 'UTC'
    },

    /**
     * Development/testing quotas
     */
    development: {
        enabled: false,
        dailyLimit: 10000,
        monthlyLimit: 100000,
        warningThreshold: 0.95,
        trackUsage: false,
        resetTime: '00:00:00',
        timezone: 'UTC'
    }
};

/**
 * Rate limiting strategies
 */
export const RateLimitStrategies = {
    /**
     * Fixed window strategy
     */
    fixed_window: {
        name: 'fixed_window',
        description: 'Fixed time window with reset at interval boundaries',
        implementation: 'FixedWindowRateLimiter'
    },

    /**
     * Sliding window strategy
     */
    sliding_window: {
        name: 'sliding_window',
        description: 'Sliding time window with continuous tracking',
        implementation: 'SlidingWindowRateLimiter'
    },

    /**
     * Token bucket strategy
     */
    token_bucket: {
        name: 'token_bucket',
        description: 'Token bucket algorithm with burst capacity',
        implementation: 'TokenBucketRateLimiter'
    },

    /**
     * Leaky bucket strategy
     */
    leaky_bucket: {
        name: 'leaky_bucket',
        description: 'Leaky bucket algorithm with smooth rate limiting',
        implementation: 'LeakyBucketRateLimiter'
    }
};

/**
 * Priority levels for request queuing
 */
export const PriorityLevels = {
    CRITICAL: { value: 1, name: 'critical', description: 'Critical system operations' },
    HIGH: { value: 2, name: 'high', description: 'High priority user requests' },
    NORMAL: { value: 3, name: 'normal', description: 'Normal user requests' },
    LOW: { value: 4, name: 'low', description: 'Background processing' },
    BATCH: { value: 5, name: 'batch', description: 'Batch operations' }
};

/**
 * Error handling strategies for rate limiting
 */
export const ErrorStrategies = {
    /**
     * Immediate rejection
     */
    reject: {
        name: 'reject',
        description: 'Immediately reject requests when limit exceeded',
        action: 'throw_error'
    },

    /**
     * Queue requests
     */
    queue: {
        name: 'queue',
        description: 'Queue requests when limit exceeded',
        action: 'add_to_queue'
    },

    /**
     * Exponential backoff
     */
    backoff: {
        name: 'backoff',
        description: 'Apply exponential backoff delay',
        action: 'apply_delay'
    },

    /**
     * Circuit breaker
     */
    circuit_breaker: {
        name: 'circuit_breaker',
        description: 'Open circuit breaker when limit exceeded',
        action: 'open_circuit'
    }
};

/**
 * Rate limit configuration builder
 */
export class RateLimitConfigBuilder {
    constructor() {
        this.config = {
            enabled: true,
            requests: 100,
            window: 60000,
            strategy: 'sliding_window'
        };
    }

    /**
     * Set rate limit from preset
     * @param {string} presetName - Preset name
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    fromPreset(presetName) {
        if (RateLimitPresets[presetName]) {
            this.config = { ...RateLimitPresets[presetName] };
        }
        return this;
    }

    /**
     * Set request limit
     * @param {number} requests - Number of requests
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    withRequests(requests) {
        this.config.requests = requests;
        return this;
    }

    /**
     * Set time window
     * @param {number} window - Time window in milliseconds
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    withWindow(window) {
        this.config.window = window;
        return this;
    }

    /**
     * Set strategy
     * @param {string} strategy - Rate limiting strategy
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    withStrategy(strategy) {
        this.config.strategy = strategy;
        return this;
    }

    /**
     * Enable/disable rate limiting
     * @param {boolean} enabled - Whether to enable rate limiting
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    enabled(enabled = true) {
        this.config.enabled = enabled;
        return this;
    }

    /**
     * Set burst allowance
     * @param {number} burst - Burst allowance
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    withBurst(burst) {
        this.config.burstAllowance = burst;
        return this;
    }

    /**
     * Enable request queuing
     * @param {number} maxQueueSize - Maximum queue size
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    withQueue(maxQueueSize = 100) {
        this.config.queueEnabled = true;
        this.config.maxQueueSize = maxQueueSize;
        return this;
    }

    /**
     * Set backoff configuration
     * @param {number} multiplier - Backoff multiplier
     * @param {number} maxTime - Maximum backoff time
     * @returns {RateLimitConfigBuilder} Builder instance
     */
    withBackoff(multiplier = 2, maxTime = 30000) {
        this.config.backoffMultiplier = multiplier;
        this.config.maxBackoffTime = maxTime;
        return this;
    }

    /**
     * Build configuration
     * @returns {Object} Rate limit configuration
     */
    build() {
        return { ...this.config };
    }
}

/**
 * Quota configuration builder
 */
export class QuotaConfigBuilder {
    constructor() {
        this.config = {
            enabled: true,
            dailyLimit: 1000,
            monthlyLimit: 10000,
            warningThreshold: 0.8,
            trackUsage: true
        };
    }

    /**
     * Set quota from preset
     * @param {string} presetName - Preset name
     * @returns {QuotaConfigBuilder} Builder instance
     */
    fromPreset(presetName) {
        if (QuotaPresets[presetName]) {
            this.config = { ...QuotaPresets[presetName] };
        }
        return this;
    }

    /**
     * Set daily limit
     * @param {number} limit - Daily limit
     * @returns {QuotaConfigBuilder} Builder instance
     */
    withDailyLimit(limit) {
        this.config.dailyLimit = limit;
        return this;
    }

    /**
     * Set monthly limit
     * @param {number} limit - Monthly limit
     * @returns {QuotaConfigBuilder} Builder instance
     */
    withMonthlyLimit(limit) {
        this.config.monthlyLimit = limit;
        return this;
    }

    /**
     * Set warning threshold
     * @param {number} threshold - Warning threshold (0-1)
     * @returns {QuotaConfigBuilder} Builder instance
     */
    withWarningThreshold(threshold) {
        this.config.warningThreshold = threshold;
        return this;
    }

    /**
     * Enable/disable quota tracking
     * @param {boolean} enabled - Whether to enable quota tracking
     * @returns {QuotaConfigBuilder} Builder instance
     */
    enabled(enabled = true) {
        this.config.enabled = enabled;
        return this;
    }

    /**
     * Enable/disable usage tracking
     * @param {boolean} track - Whether to track usage
     * @returns {QuotaConfigBuilder} Builder instance
     */
    trackUsage(track = true) {
        this.config.trackUsage = track;
        return this;
    }

    /**
     * Build configuration
     * @returns {Object} Quota configuration
     */
    build() {
        return { ...this.config };
    }
}

/**
 * Utility functions for rate limiting
 */
export class RateLimitUtils {
    /**
     * Calculate optimal rate limit for given requirements
     * @param {Object} requirements - Rate limit requirements
     * @returns {Object} Calculated rate limit configuration
     */
    static calculateOptimalRateLimit(requirements) {
        const {
            expectedThroughput,
            peakMultiplier = 2,
            safetyMargin = 0.8,
            timeWindow = 60000
        } = requirements;

        const baseRequests = Math.ceil(expectedThroughput * (timeWindow / 1000));
        const peakRequests = Math.ceil(baseRequests * peakMultiplier);
        const safeRequests = Math.ceil(peakRequests * safetyMargin);

        return {
            requests: safeRequests,
            window: timeWindow,
            burstAllowance: Math.ceil(safeRequests * 0.2),
            strategy: 'sliding_window'
        };
    }

    /**
     * Validate rate limit configuration
     * @param {Object} config - Rate limit configuration
     * @returns {Object} Validation result
     */
    static validateConfig(config) {
        const errors = [];
        const warnings = [];

        if (config.requests <= 0) {
            errors.push('Request limit must be positive');
        }

        if (config.window <= 0) {
            errors.push('Time window must be positive');
        }

        if (config.burstAllowance > config.requests) {
            warnings.push('Burst allowance exceeds request limit');
        }

        if (config.queueEnabled && config.maxQueueSize <= 0) {
            errors.push('Queue size must be positive when queuing is enabled');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get recommended configuration for environment
     * @param {string} environment - Environment name
     * @param {string} tier - Service tier
     * @returns {Object} Recommended configuration
     */
    static getRecommendedConfig(environment, tier = 'professional') {
        const rateLimitConfig = RateLimitPresets[environment] || RateLimitPresets.production;
        const quotaConfig = QuotaPresets[tier] || QuotaPresets.professional;

        return {
            rateLimiting: rateLimitConfig,
            quota: quotaConfig
        };
    }

    /**
     * Convert time units to milliseconds
     * @param {number} value - Time value
     * @param {string} unit - Time unit (seconds, minutes, hours, days)
     * @returns {number} Milliseconds
     */
    static timeToMs(value, unit) {
        const multipliers = {
            ms: 1,
            seconds: 1000,
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000
        };

        return value * (multipliers[unit] || 1);
    }

    /**
     * Format rate limit for display
     * @param {Object} config - Rate limit configuration
     * @returns {string} Formatted rate limit
     */
    static formatRateLimit(config) {
        const windowSeconds = config.window / 1000;
        const unit = windowSeconds >= 60 ? 'minute' : 'second';
        const value = unit === 'minute' ? windowSeconds / 60 : windowSeconds;

        return `${config.requests} requests per ${value} ${unit}${value !== 1 ? 's' : ''}`;
    }
}

export default {
    RateLimitPresets,
    QuotaPresets,
    RateLimitStrategies,
    PriorityLevels,
    ErrorStrategies,
    RateLimitConfigBuilder,
    QuotaConfigBuilder,
    RateLimitUtils
};

