/**
 * AgentAPI Middleware Configuration
 *
 * Default configuration and environment-based settings for the AgentAPI middleware.
 */

export const defaultConfig = {
	// Server configuration
	server: {
		port: process.env.AGENT_API_PORT || 3001,
		host: process.env.AGENT_API_HOST || 'localhost',
		enableWebSocket: process.env.AGENT_API_WEBSOCKET !== 'false',
		enableCors: process.env.AGENT_API_CORS !== 'false',
		enableCompression: process.env.AGENT_API_COMPRESSION !== 'false',
		enableHelmet: process.env.AGENT_API_HELMET !== 'false',
		logLevel: process.env.AGENT_API_LOG_LEVEL || 'info'
	},

	// Authentication configuration
	auth: {
		jwtSecret: process.env.JWT_SECRET,
		jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
		refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
		saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
		maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
		lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000
	},

	// Rate limiting configuration
	rateLimit: {
		windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
		maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
		authWindowMs:
			parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
		authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 10,
		apiWindowMs:
			parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000,
		apiMaxRequests: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 60
	},

	// Data transformer configuration
	transformer: {
		validateInput: process.env.VALIDATE_INPUT !== 'false',
		validateOutput: process.env.VALIDATE_OUTPUT !== 'false',
		strictMode: process.env.STRICT_MODE !== 'false'
	},

	// Integration endpoints
	integrations: {
		orchestrator: {
			baseUrl: process.env.ORCHESTRATOR_BASE_URL || 'http://localhost:3000',
			apiKey: process.env.ORCHESTRATOR_API_KEY,
			timeout: parseInt(process.env.ORCHESTRATOR_TIMEOUT) || 30000
		},
		claudeCode: {
			baseUrl: process.env.CLAUDE_CODE_BASE_URL || 'http://localhost:3002',
			apiKey: process.env.CLAUDE_CODE_API_KEY,
			timeout: parseInt(process.env.CLAUDE_CODE_TIMEOUT) || 60000
		}
	},

	// Monitoring configuration
	monitoring: {
		enableMetrics: process.env.ENABLE_METRICS !== 'false',
		metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000,
		enableHealthCheck: process.env.ENABLE_HEALTH_CHECK !== 'false',
		healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
	},

	// Database configuration (for production use)
	database: {
		url: process.env.DATABASE_URL,
		host: process.env.DB_HOST || 'localhost',
		port: parseInt(process.env.DB_PORT) || 5432,
		name: process.env.DB_NAME || 'agent_api',
		username: process.env.DB_USERNAME || 'postgres',
		password: process.env.DB_PASSWORD,
		ssl: process.env.DB_SSL === 'true',
		poolSize: parseInt(process.env.DB_POOL_SIZE) || 10
	},

	// Redis configuration (for session storage and caching)
	redis: {
		url: process.env.REDIS_URL,
		host: process.env.REDIS_HOST || 'localhost',
		port: parseInt(process.env.REDIS_PORT) || 6379,
		password: process.env.REDIS_PASSWORD,
		db: parseInt(process.env.REDIS_DB) || 0,
		keyPrefix: process.env.REDIS_KEY_PREFIX || 'agent-api:'
	}
};

/**
 * Get configuration with environment overrides
 */
export function getConfig(overrides = {}) {
	return mergeDeep(defaultConfig, overrides);
}

/**
 * Deep merge configuration objects
 */
function mergeDeep(target, source) {
	const result = { ...target };

	for (const key in source) {
		if (
			source[key] &&
			typeof source[key] === 'object' &&
			!Array.isArray(source[key])
		) {
			result[key] = mergeDeep(target[key] || {}, source[key]);
		} else {
			result[key] = source[key];
		}
	}

	return result;
}

/**
 * Validate configuration
 */
export function validateConfig(config) {
	const errors = [];

	// Validate required fields
	if (!config.auth.jwtSecret) {
		errors.push('JWT_SECRET is required for production use');
	}

	if (config.auth.jwtSecret && config.auth.jwtSecret.length < 32) {
		errors.push('JWT_SECRET should be at least 32 characters long');
	}

	// Validate numeric values
	if (config.server.port < 1 || config.server.port > 65535) {
		errors.push('Server port must be between 1 and 65535');
	}

	if (config.auth.saltRounds < 10 || config.auth.saltRounds > 15) {
		errors.push(
			'Salt rounds should be between 10 and 15 for security and performance'
		);
	}

	// Validate rate limiting
	if (config.rateLimit.maxRequests < 1) {
		errors.push('Rate limit max requests must be at least 1');
	}

	if (config.rateLimit.windowMs < 1000) {
		errors.push('Rate limit window must be at least 1000ms');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Environment-specific configurations
 */
export const environments = {
	development: {
		server: {
			logLevel: 'debug'
		},
		auth: {
			saltRounds: 10 // Faster for development
		},
		rateLimit: {
			maxRequests: 1000, // More lenient for development
			authMaxRequests: 50
		}
	},

	test: {
		server: {
			port: 0, // Use random port for testing
			logLevel: 'error'
		},
		auth: {
			saltRounds: 4, // Faster for tests
			jwtExpiresIn: '1m',
			refreshTokenExpiresIn: '5m'
		},
		rateLimit: {
			maxRequests: 10000, // No rate limiting in tests
			authMaxRequests: 1000
		}
	},

	production: {
		server: {
			logLevel: 'info'
		},
		auth: {
			saltRounds: 12
		},
		rateLimit: {
			maxRequests: 100,
			authMaxRequests: 5 // Stricter in production
		}
	}
};

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(
	env = process.env.NODE_ENV || 'development'
) {
	const baseConfig = getConfig();
	const envConfig = environments[env] || {};

	return mergeDeep(baseConfig, envConfig);
}

export default {
	defaultConfig,
	getConfig,
	validateConfig,
	environments,
	getEnvironmentConfig
};
