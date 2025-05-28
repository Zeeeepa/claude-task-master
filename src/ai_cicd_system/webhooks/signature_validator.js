/**
 * @fileoverview GitHub Webhook Signature Validator
 * @description Validates GitHub webhook signatures for security
 */

import crypto from 'crypto';
import { log } from '../utils/simple_logger.js';

/**
 * GitHub webhook signature validator
 * Implements HMAC-SHA256 signature verification as per GitHub webhook security
 */
export class SignatureValidator {
    constructor(webhookSecret) {
        if (!webhookSecret) {
            throw new Error('Webhook secret is required for signature validation');
        }
        this.webhookSecret = webhookSecret;
        this.algorithm = 'sha256';
    }

    /**
     * Validate GitHub webhook signature
     * @param {Object|string} payload - Webhook payload (raw body)
     * @param {string} signature - GitHub signature from X-Hub-Signature-256 header
     * @returns {boolean} True if signature is valid
     */
    validateSignature(payload, signature) {
        try {
            if (!signature) {
                log('warn', 'No signature provided for webhook validation');
                return false;
            }

            // Ensure payload is a string
            const payloadString = typeof payload === 'string' 
                ? payload 
                : JSON.stringify(payload);

            // Generate expected signature
            const expectedSignature = this.generateSignature(payloadString);

            // Compare signatures using timing-safe comparison
            const isValid = this.timingSafeEqual(signature, expectedSignature);

            if (!isValid) {
                log('warn', 'Webhook signature validation failed');
                log('debug', `Expected: ${expectedSignature}`);
                log('debug', `Received: ${signature}`);
            }

            return isValid;

        } catch (error) {
            log('error', `Signature validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Generate HMAC-SHA256 signature for payload
     * @param {string} payload - Payload string
     * @returns {string} Generated signature with sha256= prefix
     */
    generateSignature(payload) {
        const hmac = crypto.createHmac(this.algorithm, this.webhookSecret);
        hmac.update(payload, 'utf8');
        const signature = hmac.digest('hex');
        return `sha256=${signature}`;
    }

    /**
     * Timing-safe string comparison to prevent timing attacks
     * @param {string} signature1 - First signature
     * @param {string} signature2 - Second signature
     * @returns {boolean} True if signatures match
     */
    timingSafeEqual(signature1, signature2) {
        if (!signature1 || !signature2) {
            return false;
        }

        // Normalize signatures (remove sha256= prefix if present)
        const sig1 = signature1.startsWith('sha256=') 
            ? signature1.slice(7) 
            : signature1;
        const sig2 = signature2.startsWith('sha256=') 
            ? signature2.slice(7) 
            : signature2;

        // Use Node.js built-in timing-safe comparison
        if (sig1.length !== sig2.length) {
            return false;
        }

        try {
            const buf1 = Buffer.from(sig1, 'hex');
            const buf2 = Buffer.from(sig2, 'hex');
            return crypto.timingSafeEqual(buf1, buf2);
        } catch (error) {
            log('error', `Timing-safe comparison error: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate webhook signature with additional security checks
     * @param {Object} request - Express request object
     * @returns {Object} Validation result with details
     */
    validateRequest(request) {
        const signature = request.headers['x-hub-signature-256'];
        const event = request.headers['x-github-event'];
        const deliveryId = request.headers['x-github-delivery'];
        const userAgent = request.headers['user-agent'];

        const result = {
            isValid: false,
            signature: signature,
            event: event,
            deliveryId: deliveryId,
            userAgent: userAgent,
            errors: []
        };

        // Check required headers
        if (!signature) {
            result.errors.push('Missing X-Hub-Signature-256 header');
        }

        if (!event) {
            result.errors.push('Missing X-GitHub-Event header');
        }

        if (!deliveryId) {
            result.errors.push('Missing X-GitHub-Delivery header');
        }

        // Validate User-Agent (GitHub webhooks should have specific pattern)
        if (!userAgent || !userAgent.includes('GitHub-Hookshot/')) {
            result.errors.push('Invalid or missing User-Agent header');
        }

        // If basic validation fails, return early
        if (result.errors.length > 0) {
            log('warn', `Webhook validation failed: ${result.errors.join(', ')}`);
            return result;
        }

        // Validate signature
        const rawBody = request.rawBody || request.body;
        result.isValid = this.validateSignature(rawBody, signature);

        if (!result.isValid) {
            result.errors.push('Invalid webhook signature');
        }

        return result;
    }

    /**
     * Generate webhook secret for testing
     * @param {number} length - Secret length (default: 32)
     * @returns {string} Random webhook secret
     */
    static generateSecret(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Verify webhook secret strength
     * @param {string} secret - Webhook secret to verify
     * @returns {Object} Strength analysis
     */
    static analyzeSecretStrength(secret) {
        const analysis = {
            length: secret.length,
            isStrong: false,
            recommendations: []
        };

        // Check minimum length
        if (secret.length < 16) {
            analysis.recommendations.push('Use at least 16 characters');
        }

        // Check for variety in characters
        const hasLowercase = /[a-z]/.test(secret);
        const hasUppercase = /[A-Z]/.test(secret);
        const hasNumbers = /[0-9]/.test(secret);
        const hasSpecialChars = /[^a-zA-Z0-9]/.test(secret);

        let varietyScore = 0;
        if (hasLowercase) varietyScore++;
        if (hasUppercase) varietyScore++;
        if (hasNumbers) varietyScore++;
        if (hasSpecialChars) varietyScore++;

        if (varietyScore < 3) {
            analysis.recommendations.push('Include a mix of letters, numbers, and special characters');
        }

        // Check for common patterns
        if (/(.)\1{2,}/.test(secret)) {
            analysis.recommendations.push('Avoid repeating characters');
        }

        if (/123|abc|password|secret/i.test(secret)) {
            analysis.recommendations.push('Avoid common patterns and words');
        }

        // Determine if strong
        analysis.isStrong = secret.length >= 20 && 
                          varietyScore >= 3 && 
                          analysis.recommendations.length === 0;

        return analysis;
    }

    /**
     * Get validator health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            algorithm: this.algorithm,
            hasSecret: !!this.webhookSecret,
            secretLength: this.webhookSecret ? this.webhookSecret.length : 0
        };
    }
}

export default SignatureValidator;

