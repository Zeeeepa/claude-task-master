/**
 * @fileoverview Webhook Validator
 * @description Security validation for webhook signatures and payload integrity
 */

import crypto from 'crypto';

/**
 * Webhook Validator class
 */
export class WebhookValidator {
    constructor(config = {}) {
        this.config = {
            github: {
                secret: config.github?.secret || process.env.GITHUB_WEBHOOK_SECRET,
                algorithm: 'sha256',
                headerName: 'x-hub-signature-256'
            },
            linear: {
                secret: config.linear?.secret || process.env.LINEAR_WEBHOOK_SECRET,
                algorithm: 'sha256',
                headerName: 'linear-signature'
            },
            codegen: {
                secret: config.codegen?.secret || process.env.CODEGEN_WEBHOOK_SECRET,
                algorithm: 'sha256',
                headerName: 'x-codegen-signature'
            },
            claude_code: {
                secret: config.claude_code?.secret || process.env.CLAUDE_CODE_WEBHOOK_SECRET,
                algorithm: 'sha256',
                headerName: 'x-claude-signature'
            },
            enableTimestampValidation: config.enableTimestampValidation !== false,
            timestampTolerance: config.timestampTolerance || 300, // 5 minutes
            enableIPWhitelist: config.enableIPWhitelist || false,
            allowedIPs: config.allowedIPs || [],
            enableRateLimiting: config.enableRateLimiting !== false,
            ...config
        };

        this.statistics = {
            validationsPerformed: 0,
            validationsSucceeded: 0,
            validationsFailed: 0,
            signatureFailures: 0,
            timestampFailures: 0,
            ipFailures: 0,
            lastValidation: null
        };

        this.rateLimitCache = new Map();
    }

    /**
     * Validate webhook signature
     * @param {string} source - Webhook source (github, linear, etc.)
     * @param {Object} req - Express request object
     * @returns {Promise<boolean>} Validation result
     */
    async validateSignature(source, req) {
        const startTime = Date.now();
        
        try {
            this.statistics.validationsPerformed++;
            this.statistics.lastValidation = new Date().toISOString();

            // Get source configuration
            const sourceConfig = this.config[source];
            if (!sourceConfig) {
                console.warn(`No configuration found for webhook source: ${source}`);
                this.statistics.validationsFailed++;
                return false;
            }

            // Check if secret is configured
            if (!sourceConfig.secret) {
                console.warn(`No secret configured for webhook source: ${source}`);
                this.statistics.validationsFailed++;
                return false;
            }

            // Validate IP address if enabled
            if (this.config.enableIPWhitelist) {
                const isValidIP = await this.validateIPAddress(req.ip, source);
                if (!isValidIP) {
                    this.statistics.ipFailures++;
                    this.statistics.validationsFailed++;
                    return false;
                }
            }

            // Validate timestamp if enabled
            if (this.config.enableTimestampValidation) {
                const isValidTimestamp = await this.validateTimestamp(req, source);
                if (!isValidTimestamp) {
                    this.statistics.timestampFailures++;
                    this.statistics.validationsFailed++;
                    return false;
                }
            }

            // Validate signature
            const isValidSignature = await this.validateWebhookSignature(req, sourceConfig);
            if (!isValidSignature) {
                this.statistics.signatureFailures++;
                this.statistics.validationsFailed++;
                return false;
            }

            // Check rate limiting if enabled
            if (this.config.enableRateLimiting) {
                const isWithinRateLimit = await this.checkRateLimit(req.ip, source);
                if (!isWithinRateLimit) {
                    this.statistics.validationsFailed++;
                    return false;
                }
            }

            this.statistics.validationsSucceeded++;
            return true;

        } catch (error) {
            console.error(`Webhook validation failed for ${source}:`, error);
            this.statistics.validationsFailed++;
            return false;
        }
    }

    /**
     * Validate webhook signature
     * @param {Object} req - Express request object
     * @param {Object} sourceConfig - Source configuration
     * @returns {Promise<boolean>} Signature validation result
     */
    async validateWebhookSignature(req, sourceConfig) {
        try {
            const signature = req.headers[sourceConfig.headerName];
            if (!signature) {
                console.warn(`Missing signature header: ${sourceConfig.headerName}`);
                return false;
            }

            const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
            const expectedSignature = this.generateSignature(payload, sourceConfig.secret, sourceConfig.algorithm);

            // Compare signatures using timing-safe comparison
            return this.safeCompare(signature, expectedSignature);

        } catch (error) {
            console.error('Signature validation error:', error);
            return false;
        }
    }

    /**
     * Generate webhook signature
     * @param {Buffer} payload - Request payload
     * @param {string} secret - Webhook secret
     * @param {string} algorithm - Hash algorithm
     * @returns {string} Generated signature
     */
    generateSignature(payload, secret, algorithm) {
        const hmac = crypto.createHmac(algorithm, secret);
        hmac.update(payload);
        return `${algorithm}=${hmac.digest('hex')}`;
    }

    /**
     * Safely compare signatures to prevent timing attacks
     * @param {string} signature1 - First signature
     * @param {string} signature2 - Second signature
     * @returns {boolean} True if signatures match
     */
    safeCompare(signature1, signature2) {
        if (signature1.length !== signature2.length) {
            return false;
        }

        let result = 0;
        for (let i = 0; i < signature1.length; i++) {
            result |= signature1.charCodeAt(i) ^ signature2.charCodeAt(i);
        }

        return result === 0;
    }

    /**
     * Validate IP address
     * @param {string} ip - Client IP address
     * @param {string} source - Webhook source
     * @returns {Promise<boolean>} IP validation result
     */
    async validateIPAddress(ip, source) {
        try {
            // Check against whitelist
            if (this.config.allowedIPs.length > 0) {
                const isAllowed = this.config.allowedIPs.some(allowedIP => {
                    return this.isIPInRange(ip, allowedIP);
                });

                if (!isAllowed) {
                    console.warn(`IP ${ip} not in whitelist for source ${source}`);
                    return false;
                }
            }

            // Source-specific IP validation
            if (source === 'github') {
                return await this.validateGitHubIP(ip);
            } else if (source === 'linear') {
                return await this.validateLinearIP(ip);
            }

            return true;

        } catch (error) {
            console.error('IP validation error:', error);
            return false;
        }
    }

    /**
     * Validate GitHub IP address
     * @param {string} ip - Client IP address
     * @returns {Promise<boolean>} GitHub IP validation result
     */
    async validateGitHubIP(ip) {
        // GitHub webhook IP ranges (these should be fetched from GitHub API in production)
        const githubIPRanges = [
            '192.30.252.0/22',
            '185.199.108.0/22',
            '140.82.112.0/20',
            '143.55.64.0/20'
        ];

        return githubIPRanges.some(range => this.isIPInRange(ip, range));
    }

    /**
     * Validate Linear IP address
     * @param {string} ip - Client IP address
     * @returns {Promise<boolean>} Linear IP validation result
     */
    async validateLinearIP(ip) {
        // Linear webhook IP ranges (these should be fetched from Linear in production)
        // For now, allow all IPs for Linear
        return true;
    }

    /**
     * Check if IP is in range
     * @param {string} ip - IP address to check
     * @param {string} range - IP range (CIDR notation or single IP)
     * @returns {boolean} True if IP is in range
     */
    isIPInRange(ip, range) {
        if (range.includes('/')) {
            // CIDR notation
            const [rangeIP, prefixLength] = range.split('/');
            const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
            
            const ipInt = this.ipToInt(ip);
            const rangeInt = this.ipToInt(rangeIP);
            
            return (ipInt & mask) === (rangeInt & mask);
        } else {
            // Single IP
            return ip === range;
        }
    }

    /**
     * Convert IP address to integer
     * @param {string} ip - IP address
     * @returns {number} IP as integer
     */
    ipToInt(ip) {
        return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
    }

    /**
     * Validate timestamp
     * @param {Object} req - Express request object
     * @param {string} source - Webhook source
     * @returns {Promise<boolean>} Timestamp validation result
     */
    async validateTimestamp(req, source) {
        try {
            let timestamp;

            // Extract timestamp based on source
            if (source === 'github') {
                // GitHub doesn't provide timestamp in headers, use current time
                timestamp = Date.now() / 1000;
            } else if (source === 'linear') {
                timestamp = req.headers['linear-timestamp'];
            } else {
                // Use current time for other sources
                timestamp = Date.now() / 1000;
            }

            if (!timestamp) {
                console.warn(`No timestamp found for source ${source}`);
                return true; // Don't fail if timestamp is not available
            }

            const currentTime = Date.now() / 1000;
            const timeDiff = Math.abs(currentTime - timestamp);

            if (timeDiff > this.config.timestampTolerance) {
                console.warn(`Timestamp too old for source ${source}: ${timeDiff}s > ${this.config.timestampTolerance}s`);
                return false;
            }

            return true;

        } catch (error) {
            console.error('Timestamp validation error:', error);
            return true; // Don't fail on timestamp validation errors
        }
    }

    /**
     * Check rate limit
     * @param {string} ip - Client IP address
     * @param {string} source - Webhook source
     * @returns {Promise<boolean>} Rate limit check result
     */
    async checkRateLimit(ip, source) {
        try {
            const key = `${ip}:${source}`;
            const now = Date.now();
            const windowMs = 60000; // 1 minute
            const maxRequests = 100; // 100 requests per minute

            if (!this.rateLimitCache.has(key)) {
                this.rateLimitCache.set(key, {
                    count: 1,
                    resetTime: now + windowMs
                });
                return true;
            }

            const rateLimit = this.rateLimitCache.get(key);

            // Reset if window has passed
            if (now > rateLimit.resetTime) {
                rateLimit.count = 1;
                rateLimit.resetTime = now + windowMs;
                return true;
            }

            // Check if within limit
            if (rateLimit.count >= maxRequests) {
                console.warn(`Rate limit exceeded for ${ip}:${source}: ${rateLimit.count}/${maxRequests}`);
                return false;
            }

            rateLimit.count++;
            return true;

        } catch (error) {
            console.error('Rate limit check error:', error);
            return true; // Don't fail on rate limit errors
        }
    }

    /**
     * Validate payload structure
     * @param {Object} payload - Webhook payload
     * @param {string} source - Webhook source
     * @returns {boolean} Payload validation result
     */
    validatePayloadStructure(payload, source) {
        try {
            if (!payload || typeof payload !== 'object') {
                return false;
            }

            // Source-specific payload validation
            switch (source) {
                case 'github':
                    return this.validateGitHubPayload(payload);
                case 'linear':
                    return this.validateLinearPayload(payload);
                case 'codegen':
                    return this.validateCodegenPayload(payload);
                case 'claude_code':
                    return this.validateClaudeCodePayload(payload);
                default:
                    return true;
            }

        } catch (error) {
            console.error('Payload validation error:', error);
            return false;
        }
    }

    /**
     * Validate GitHub payload structure
     * @param {Object} payload - GitHub payload
     * @returns {boolean} Validation result
     */
    validateGitHubPayload(payload) {
        // Basic GitHub payload structure validation
        if (payload.repository && payload.repository.full_name) {
            return true;
        }
        
        if (payload.pull_request && payload.pull_request.number) {
            return true;
        }

        if (payload.issue && payload.issue.number) {
            return true;
        }

        return false;
    }

    /**
     * Validate Linear payload structure
     * @param {Object} payload - Linear payload
     * @returns {boolean} Validation result
     */
    validateLinearPayload(payload) {
        // Basic Linear payload structure validation
        return payload.type && payload.data && payload.data.id;
    }

    /**
     * Validate Codegen payload structure
     * @param {Object} payload - Codegen payload
     * @returns {boolean} Validation result
     */
    validateCodegenPayload(payload) {
        // Basic Codegen payload structure validation
        return payload.event_type && payload.data;
    }

    /**
     * Validate Claude Code payload structure
     * @param {Object} payload - Claude Code payload
     * @returns {boolean} Validation result
     */
    validateClaudeCodePayload(payload) {
        // Basic Claude Code payload structure validation
        return payload.event_type && payload.data;
    }

    /**
     * Clean up rate limit cache
     */
    cleanupRateLimitCache() {
        const now = Date.now();
        
        for (const [key, rateLimit] of this.rateLimitCache) {
            if (now > rateLimit.resetTime) {
                this.rateLimitCache.delete(key);
            }
        }
    }

    /**
     * Get validation statistics
     * @returns {Object} Validation statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            successRate: this.statistics.validationsPerformed > 0 
                ? (this.statistics.validationsSucceeded / this.statistics.validationsPerformed) * 100
                : 0,
            rateLimitCacheSize: this.rateLimitCache.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check success rate
            const successRate = this.statistics.validationsPerformed > 0 
                ? (this.statistics.validationsSucceeded / this.statistics.validationsPerformed) * 100
                : 100;

            if (successRate < 80) {
                return 'degraded';
            }

            // Check if secrets are configured
            const configuredSources = Object.keys(this.config).filter(key => 
                this.config[key]?.secret && typeof this.config[key] === 'object'
            );

            if (configuredSources.length === 0) {
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Start cleanup timer
     */
    startCleanupTimer() {
        // Clean up rate limit cache every 5 minutes
        setInterval(() => {
            this.cleanupRateLimitCache();
        }, 5 * 60 * 1000);
    }
}

export default WebhookValidator;

