/**
 * @fileoverview Webhook Security
 * @description Security validation and authentication for GitHub webhooks
 */

import crypto from 'crypto';
import { WEBHOOK_CONFIG } from '../config/webhook_config.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Webhook security handler for GitHub webhook validation
 */
export class WebhookSecurity {
    constructor(config = {}) {
        this.config = {
            ...WEBHOOK_CONFIG.security,
            ...config
        };
        this.secret = config.secret || WEBHOOK_CONFIG.secret;
    }

    /**
     * Validate GitHub webhook signature
     * @param {Object} req - Express request object
     * @returns {Promise<boolean>} Validation result
     */
    async validateSignature(req) {
        try {
            const signature = req.headers[this.config.signature_header];
            const body = req.body;

            if (!signature) {
                throw new Error('Missing webhook signature');
            }

            if (!this.secret) {
                throw new Error('Webhook secret not configured');
            }

            // GitHub sends signature as 'sha256=<hash>'
            const expectedSignature = this._generateSignature(body);
            const providedSignature = signature.replace('sha256=', '');

            // Use timing-safe comparison to prevent timing attacks
            const isValid = this._timingSafeEqual(expectedSignature, providedSignature);

            if (!isValid) {
                log('warn', 'Invalid webhook signature detected', {
                    provided: providedSignature.substring(0, 8) + '...',
                    expected: expectedSignature.substring(0, 8) + '...'
                });
                throw new Error('Invalid webhook signature');
            }

            log('debug', 'Webhook signature validated successfully');
            return true;

        } catch (error) {
            log('error', `Webhook signature validation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate request origin and headers
     * @param {Object} req - Express request object
     * @returns {Promise<boolean>} Validation result
     */
    async validateOrigin(req) {
        try {
            // Validate User-Agent
            const userAgent = req.headers['user-agent'];
            if (!userAgent || !this.config.user_agent_pattern.test(userAgent)) {
                throw new Error('Invalid User-Agent header');
            }

            // Validate Content-Type
            const contentType = req.headers['content-type'];
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Invalid Content-Type header');
            }

            // Validate IP address (if configured)
            if (this.config.allowed_ips && this.config.allowed_ips.length > 0) {
                const clientIP = this._getClientIP(req);
                if (!this._isIPAllowed(clientIP)) {
                    throw new Error(`IP address not allowed: ${clientIP}`);
                }
            }

            log('debug', 'Webhook origin validation passed');
            return true;

        } catch (error) {
            log('error', `Webhook origin validation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate webhook payload structure
     * @param {Object} payload - Webhook payload
     * @returns {Promise<boolean>} Validation result
     */
    async validatePayload(payload) {
        try {
            if (!payload || typeof payload !== 'object') {
                throw new Error('Invalid payload structure');
            }

            // Check for required GitHub webhook fields
            const requiredFields = ['action', 'repository'];
            for (const field of requiredFields) {
                if (!(field in payload)) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Validate repository structure
            if (!payload.repository || !payload.repository.full_name) {
                throw new Error('Invalid repository information');
            }

            // Validate action
            if (typeof payload.action !== 'string' || payload.action.trim() === '') {
                throw new Error('Invalid action field');
            }

            log('debug', 'Webhook payload validation passed');
            return true;

        } catch (error) {
            log('error', `Webhook payload validation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate HMAC signature for payload
     * @param {string|Buffer} payload - Payload to sign
     * @returns {string} HMAC signature
     * @private
     */
    _generateSignature(payload) {
        const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return crypto
            .createHmac('sha256', this.secret)
            .update(payloadString, 'utf8')
            .digest('hex');
    }

    /**
     * Timing-safe string comparison
     * @param {string} a - First string
     * @param {string} b - Second string
     * @returns {boolean} Comparison result
     * @private
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
     * Extract client IP address from request
     * @param {Object} req - Express request object
     * @returns {string} Client IP address
     * @private
     */
    _getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               'unknown';
    }

    /**
     * Check if IP address is in allowed list
     * @param {string} ip - IP address to check
     * @returns {boolean} Whether IP is allowed
     * @private
     */
    _isIPAllowed(ip) {
        if (!this.config.allowed_ips || this.config.allowed_ips.length === 0) {
            return true;
        }

        // Simple IP range checking (for production, consider using a proper CIDR library)
        for (const allowedRange of this.config.allowed_ips) {
            if (this._isIPInRange(ip, allowedRange)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if IP is in CIDR range
     * @param {string} ip - IP address
     * @param {string} range - CIDR range
     * @returns {boolean} Whether IP is in range
     * @private
     */
    _isIPInRange(ip, range) {
        // Basic CIDR checking - for production use, consider ip-range-check library
        if (!range.includes('/')) {
            return ip === range;
        }

        try {
            const [rangeIP, prefixLength] = range.split('/');
            const ipNum = this._ipToNumber(ip);
            const rangeNum = this._ipToNumber(rangeIP);
            const mask = (0xFFFFFFFF << (32 - parseInt(prefixLength))) >>> 0;

            return (ipNum & mask) === (rangeNum & mask);
        } catch (error) {
            log('warn', `Invalid IP range format: ${range}`);
            return false;
        }
    }

    /**
     * Convert IP address to number
     * @param {string} ip - IP address
     * @returns {number} IP as number
     * @private
     */
    _ipToNumber(ip) {
        return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
    }

    /**
     * Generate a secure webhook secret
     * @param {number} length - Secret length
     * @returns {string} Generated secret
     */
    static generateSecret(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Validate webhook secret strength
     * @param {string} secret - Secret to validate
     * @returns {Object} Validation result
     */
    static validateSecret(secret) {
        const errors = [];

        if (!secret) {
            errors.push('Secret is required');
        } else {
            if (secret.length < 16) {
                errors.push('Secret should be at least 16 characters long');
            }
            if (secret.length > 100) {
                errors.push('Secret should not exceed 100 characters');
            }
            if (!/^[a-zA-Z0-9\-_]+$/.test(secret)) {
                errors.push('Secret should only contain alphanumeric characters, hyphens, and underscores');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            strength: this._calculateSecretStrength(secret)
        };
    }

    /**
     * Calculate secret strength score
     * @param {string} secret - Secret to analyze
     * @returns {string} Strength level
     * @private
     */
    static _calculateSecretStrength(secret) {
        if (!secret) return 'none';
        
        let score = 0;
        
        // Length scoring
        if (secret.length >= 16) score += 1;
        if (secret.length >= 32) score += 1;
        if (secret.length >= 64) score += 1;
        
        // Character variety scoring
        if (/[a-z]/.test(secret)) score += 1;
        if (/[A-Z]/.test(secret)) score += 1;
        if (/[0-9]/.test(secret)) score += 1;
        if (/[^a-zA-Z0-9]/.test(secret)) score += 1;
        
        if (score <= 2) return 'weak';
        if (score <= 4) return 'medium';
        if (score <= 6) return 'strong';
        return 'very-strong';
    }
}

export default WebhookSecurity;

