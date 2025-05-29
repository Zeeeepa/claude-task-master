/**
 * @fileoverview Consolidated Security Manager
 * @description Unified security validation consolidating PRs #48, #49, #58
 * @version 3.0.0
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

/**
 * Consolidated Security Manager
 * Combines security features from multiple PRs
 */
export class SecurityManager {
    constructor(config = {}) {
        this.config = {
            github: {
                secret: config.github?.secret || process.env.GITHUB_WEBHOOK_SECRET,
                algorithm: config.github?.algorithm || 'sha256',
                encoding: config.github?.encoding || 'hex'
            },
            validation: {
                enablePayloadValidation: config.validation?.enablePayloadValidation !== false,
                maxPayloadSize: config.validation?.maxPayloadSize || 10485760,
                allowedEvents: config.validation?.allowedEvents || [
                    'pull_request', 'push', 'check_run', 'check_suite',
                    'pull_request_review', 'pull_request_review_comment', 'status'
                ],
                requiredHeaders: config.validation?.requiredHeaders || [
                    'X-GitHub-Event', 'X-GitHub-Delivery', 'X-Hub-Signature-256'
                ]
            },
            security: {
                enableRateLimiting: config.security?.enableRateLimiting !== false,
                enableIPWhitelist: config.security?.enableIPWhitelist === true,
                allowedIPs: config.security?.allowedIPs || [],
                enableUserAgentValidation: config.security?.enableUserAgentValidation !== false,
                allowedUserAgents: config.security?.allowedUserAgents || [
                    '^GitHub-Hookshot/',
                    '^GitHub-Hookshot-[a-f0-9]+$'
                ],
                enableTimestampValidation: config.security?.enableTimestampValidation !== false,
                maxTimestampAge: config.security?.maxTimestampAge || 300000
            },
            ...config
        };

        this.logger = logger.child({ component: 'security-manager' });
        
        // Security metrics
        this.metrics = {
            totalRequests: 0,
            validRequests: 0,
            invalidRequests: 0,
            signatureFailures: 0,
            ipBlocked: 0,
            userAgentBlocked: 0,
            timestampFailures: 0,
            payloadTooLarge: 0,
            eventNotAllowed: 0
        };

        // Rate limiting cache
        this.rateLimitCache = new Map();
        
        // Compiled regex patterns for user agents
        this.userAgentPatterns = this.config.security.allowedUserAgents.map(pattern => 
            new RegExp(pattern)
        );
    }

    /**
     * Initialize security manager
     */
    async initialize() {
        this.logger.info('Initializing security manager...');
        
        // Validate configuration
        const validation = this._validateConfig();
        if (!validation.valid) {
            throw new Error(`Security configuration invalid: ${validation.errors.join(', ')}`);
        }

        // Log security configuration (sanitized)
        this.logger.info('Security manager initialized', {
            signatureValidation: !!this.config.github.secret,
            ipWhitelist: this.config.security.enableIPWhitelist,
            userAgentValidation: this.config.security.enableUserAgentValidation,
            timestampValidation: this.config.security.enableTimestampValidation,
            allowedEvents: this.config.validation.allowedEvents.length
        });
    }

    /**
     * Validate incoming webhook request
     */
    async validateRequest(req, provider = 'github') {
        this.metrics.totalRequests++;
        
        const validationResult = {
            valid: false,
            message: '',
            details: {}
        };

        try {
            // Step 1: Basic request validation
            const basicValidation = await this._validateBasicRequest(req);
            if (!basicValidation.valid) {
                this.metrics.invalidRequests++;
                return { ...validationResult, ...basicValidation };
            }

            // Step 2: Provider-specific validation
            const providerValidation = await this._validateProvider(req, provider);
            if (!providerValidation.valid) {
                this.metrics.invalidRequests++;
                return { ...validationResult, ...providerValidation };
            }

            // Step 3: Security checks
            const securityValidation = await this._validateSecurity(req);
            if (!securityValidation.valid) {
                this.metrics.invalidRequests++;
                return { ...validationResult, ...securityValidation };
            }

            // Step 4: Content validation
            const contentValidation = await this._validateContent(req);
            if (!contentValidation.valid) {
                this.metrics.invalidRequests++;
                return { ...validationResult, ...contentValidation };
            }

            this.metrics.validRequests++;
            
            return {
                valid: true,
                message: 'Request validation successful',
                details: {
                    provider,
                    eventType: req.headers['x-github-event'] || req.headers['x-event-type'],
                    deliveryId: req.headers['x-github-delivery'] || req.headers['x-delivery-id']
                }
            };

        } catch (error) {
            this.metrics.invalidRequests++;
            this.logger.error('Security validation error', { error: error.message });
            
            return {
                valid: false,
                message: 'Security validation failed',
                details: { error: error.message }
            };
        }
    }

    /**
     * Validate basic request structure
     */
    async _validateBasicRequest(req) {
        // Check required headers
        for (const header of this.config.validation.requiredHeaders) {
            const headerKey = header.toLowerCase();
            if (!req.headers[headerKey]) {
                return {
                    valid: false,
                    message: `Missing required header: ${header}`,
                    details: { missingHeader: header }
                };
            }
        }

        // Check payload size
        const contentLength = parseInt(req.headers['content-length'] || '0');
        if (contentLength > this.config.validation.maxPayloadSize) {
            this.metrics.payloadTooLarge++;
            return {
                valid: false,
                message: 'Payload too large',
                details: { 
                    size: contentLength, 
                    maxSize: this.config.validation.maxPayloadSize 
                }
            };
        }

        // Check content type
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            return {
                valid: false,
                message: 'Invalid content type',
                details: { contentType }
            };
        }

        return { valid: true };
    }

    /**
     * Validate provider-specific requirements
     */
    async _validateProvider(req, provider) {
        switch (provider) {
            case 'github':
                return await this._validateGitHubRequest(req);
            default:
                return await this._validateGenericRequest(req);
        }
    }

    /**
     * Validate GitHub-specific requirements
     */
    async _validateGitHubRequest(req) {
        // Validate event type
        const eventType = req.headers['x-github-event'];
        if (this.config.validation.allowedEvents.length > 0 && 
            !this.config.validation.allowedEvents.includes(eventType)) {
            this.metrics.eventNotAllowed++;
            return {
                valid: false,
                message: 'Event type not allowed',
                details: { 
                    eventType, 
                    allowedEvents: this.config.validation.allowedEvents 
                }
            };
        }

        // Validate signature
        if (this.config.github.secret) {
            const signatureValidation = await this._validateGitHubSignature(req);
            if (!signatureValidation.valid) {
                this.metrics.signatureFailures++;
                return signatureValidation;
            }
        }

        return { valid: true };
    }

    /**
     * Validate generic webhook request
     */
    async _validateGenericRequest(req) {
        // Basic validation for non-GitHub providers
        return { valid: true };
    }

    /**
     * Validate GitHub webhook signature
     */
    async _validateGitHubSignature(req) {
        const signature = req.headers['x-hub-signature-256'];
        if (!signature) {
            return {
                valid: false,
                message: 'Missing webhook signature',
                details: { header: 'x-hub-signature-256' }
            };
        }

        // Extract signature hash
        const sigHashAlg = 'sha256=';
        if (!signature.startsWith(sigHashAlg)) {
            return {
                valid: false,
                message: 'Invalid signature format',
                details: { signature: signature.substring(0, 20) + '...' }
            };
        }

        const sigHash = signature.substring(sigHashAlg.length);
        
        // Calculate expected signature
        const expectedHash = crypto
            .createHmac('sha256', this.config.github.secret)
            .update(req.rawBody || JSON.stringify(req.body))
            .digest('hex');

        // Timing-safe comparison
        if (!this._timingSafeEqual(sigHash, expectedHash)) {
            return {
                valid: false,
                message: 'Invalid webhook signature',
                details: { signatureMatch: false }
            };
        }

        return { valid: true };
    }

    /**
     * Validate security requirements
     */
    async _validateSecurity(req) {
        // IP whitelist validation
        if (this.config.security.enableIPWhitelist) {
            const ipValidation = await this._validateIPAddress(req);
            if (!ipValidation.valid) {
                this.metrics.ipBlocked++;
                return ipValidation;
            }
        }

        // User agent validation
        if (this.config.security.enableUserAgentValidation) {
            const userAgentValidation = await this._validateUserAgent(req);
            if (!userAgentValidation.valid) {
                this.metrics.userAgentBlocked++;
                return userAgentValidation;
            }
        }

        // Timestamp validation
        if (this.config.security.enableTimestampValidation) {
            const timestampValidation = await this._validateTimestamp(req);
            if (!timestampValidation.valid) {
                this.metrics.timestampFailures++;
                return timestampValidation;
            }
        }

        return { valid: true };
    }

    /**
     * Validate IP address against whitelist
     */
    async _validateIPAddress(req) {
        const clientIP = this._getClientIP(req);
        
        if (this.config.security.allowedIPs.length === 0) {
            return { valid: true }; // No restrictions if list is empty
        }

        const isAllowed = this.config.security.allowedIPs.some(allowedIP => {
            return this._isIPInRange(clientIP, allowedIP);
        });

        if (!isAllowed) {
            this.logger.warn('IP address blocked', { clientIP });
            return {
                valid: false,
                message: 'IP address not allowed',
                details: { clientIP }
            };
        }

        return { valid: true };
    }

    /**
     * Validate user agent
     */
    async _validateUserAgent(req) {
        const userAgent = req.headers['user-agent'];
        
        if (!userAgent) {
            return {
                valid: false,
                message: 'Missing user agent',
                details: { userAgent: null }
            };
        }

        const isAllowed = this.userAgentPatterns.some(pattern => 
            pattern.test(userAgent)
        );

        if (!isAllowed) {
            this.logger.warn('User agent blocked', { userAgent });
            return {
                valid: false,
                message: 'User agent not allowed',
                details: { userAgent }
            };
        }

        return { valid: true };
    }

    /**
     * Validate request timestamp
     */
    async _validateTimestamp(req) {
        const timestamp = req.headers['x-github-delivery-timestamp'] || 
                         req.headers['x-timestamp'] ||
                         new Date().toISOString();

        try {
            const requestTime = new Date(timestamp).getTime();
            const currentTime = Date.now();
            const age = currentTime - requestTime;

            if (age > this.config.security.maxTimestampAge) {
                return {
                    valid: false,
                    message: 'Request timestamp too old',
                    details: { 
                        age, 
                        maxAge: this.config.security.maxTimestampAge 
                    }
                };
            }

            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                message: 'Invalid timestamp format',
                details: { timestamp }
            };
        }
    }

    /**
     * Validate request content
     */
    async _validateContent(req) {
        if (!this.config.validation.enablePayloadValidation) {
            return { valid: true };
        }

        // Validate JSON structure
        if (!req.body || typeof req.body !== 'object') {
            return {
                valid: false,
                message: 'Invalid JSON payload',
                details: { bodyType: typeof req.body }
            };
        }

        // Provider-specific content validation
        // This could be extended with JSON schema validation

        return { valid: true };
    }

    /**
     * Get client IP address
     */
    _getClientIP(req) {
        return req.ip || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               'unknown';
    }

    /**
     * Check if IP is in CIDR range
     */
    _isIPInRange(ip, range) {
        if (range.includes('/')) {
            // CIDR notation
            const [rangeIP, prefixLength] = range.split('/');
            const prefix = parseInt(prefixLength);
            
            try {
                const ipInt = this._ipToInt(ip);
                const rangeInt = this._ipToInt(rangeIP);
                const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
                
                return (ipInt & mask) === (rangeInt & mask);
            } catch (error) {
                this.logger.warn('Invalid IP range format', { range, error: error.message });
                return false;
            }
        } else {
            // Exact match
            return ip === range;
        }
    }

    /**
     * Convert IP address to integer
     */
    _ipToInt(ip) {
        const parts = ip.split('.');
        if (parts.length !== 4) {
            throw new Error('Invalid IP address format');
        }
        
        return parts.reduce((acc, part) => {
            const num = parseInt(part);
            if (num < 0 || num > 255) {
                throw new Error('Invalid IP address part');
            }
            return (acc << 8) + num;
        }, 0) >>> 0;
    }

    /**
     * Timing-safe string comparison
     */
    _timingSafeEqual(a, b) {
        if (a.length !== b.length) {
            return false;
        }

        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }

        return result === 0;
    }

    /**
     * Validate configuration
     */
    _validateConfig() {
        const errors = [];
        const warnings = [];

        // Check GitHub secret
        if (!this.config.github.secret) {
            warnings.push('GitHub webhook secret not configured');
        }

        // Check IP whitelist
        if (this.config.security.enableIPWhitelist && 
            this.config.security.allowedIPs.length === 0) {
            warnings.push('IP whitelist enabled but no IPs configured');
        }

        // Validate IP ranges
        for (const ip of this.config.security.allowedIPs) {
            try {
                if (ip.includes('/')) {
                    const [rangeIP, prefix] = ip.split('/');
                    this._ipToInt(rangeIP);
                    const prefixNum = parseInt(prefix);
                    if (prefixNum < 0 || prefixNum > 32) {
                        errors.push(`Invalid CIDR prefix: ${ip}`);
                    }
                } else {
                    this._ipToInt(ip);
                }
            } catch (error) {
                errors.push(`Invalid IP address: ${ip}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get security health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            metrics: this.getStats(),
            configuration: {
                signatureValidation: !!this.config.github.secret,
                ipWhitelist: this.config.security.enableIPWhitelist,
                userAgentValidation: this.config.security.enableUserAgentValidation,
                timestampValidation: this.config.security.enableTimestampValidation
            }
        };
    }

    /**
     * Get security statistics
     */
    getStats() {
        const total = this.metrics.totalRequests;
        return {
            ...this.metrics,
            successRate: total > 0 ? (this.metrics.validRequests / total * 100).toFixed(2) + '%' : '0%',
            failureRate: total > 0 ? (this.metrics.invalidRequests / total * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        Object.keys(this.metrics).forEach(key => {
            this.metrics[key] = 0;
        });
        this.logger.info('Security statistics reset');
    }
}

export default SecurityManager;

