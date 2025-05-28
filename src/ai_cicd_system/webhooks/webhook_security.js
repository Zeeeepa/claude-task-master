/**
 * @fileoverview Webhook Security - Authentication, validation, and security measures
 * @description Handles webhook signature verification, payload validation, and security controls
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { log } from '../../utils/simple_logger.js';

/**
 * Webhook Security Manager
 * Handles authentication, validation, and security for webhook endpoints
 */
export class WebhookSecurity extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            github: {
                secret: config.github?.secret || process.env.GITHUB_WEBHOOK_SECRET,
                algorithm: config.github?.algorithm || 'sha256',
                encoding: config.github?.encoding || 'hex'
            },
            validation: {
                enablePayloadValidation: config.validation?.enablePayloadValidation !== false,
                maxPayloadSize: config.validation?.maxPayloadSize || 10 * 1024 * 1024, // 10MB
                allowedEvents: config.validation?.allowedEvents || [
                    'pull_request',
                    'push',
                    'check_run',
                    'check_suite',
                    'pull_request_review',
                    'pull_request_review_comment',
                    'status'
                ],
                requiredHeaders: config.validation?.requiredHeaders || [
                    'X-GitHub-Event',
                    'X-GitHub-Delivery',
                    'X-Hub-Signature-256'
                ]
            },
            security: {
                enableRateLimiting: config.security?.enableRateLimiting !== false,
                enableIPWhitelist: config.security?.enableIPWhitelist || false,
                allowedIPs: config.security?.allowedIPs || [],
                enableUserAgentValidation: config.security?.enableUserAgentValidation !== false,
                allowedUserAgents: config.security?.allowedUserAgents || [
                    /^GitHub-Hookshot\//,
                    /^GitHub-Hookshot-[a-f0-9]+$/
                ],
                enableTimestampValidation: config.security?.enableTimestampValidation !== false,
                maxTimestampAge: config.security?.maxTimestampAge || 300000 // 5 minutes
            },
            monitoring: {
                enableSecurityMetrics: config.monitoring?.enableSecurityMetrics !== false,
                logSecurityEvents: config.monitoring?.logSecurityEvents !== false
            },
            ...config
        };

        // Initialize JSON schema validator
        this.ajv = new Ajv({ allErrors: true, strict: false });
        addFormats(this.ajv);
        
        // Security metrics
        this.metrics = {
            totalRequests: 0,
            validSignatures: 0,
            invalidSignatures: 0,
            validPayloads: 0,
            invalidPayloads: 0,
            blockedRequests: 0,
            securityViolations: 0,
            lastSecurityEvent: null,
            startTime: Date.now()
        };

        // Security event tracking
        this.securityEvents = [];
        this.maxSecurityEvents = 1000;

        this.setupSchemas();
    }

    /**
     * Initialize the security manager
     */
    async initialize() {
        try {
            this.validateConfiguration();
            
            log('info', 'Webhook Security Manager initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize webhook security: ${error.message}`);
            throw error;
        }
    }

    /**
     * Verify GitHub webhook signature
     * @param {Buffer} payload - Raw payload buffer
     * @param {string} signature - GitHub signature header
     * @returns {boolean} Whether signature is valid
     */
    verifySignature(payload, signature) {
        this.metrics.totalRequests++;
        
        try {
            if (!this.config.github.secret) {
                log('warning', 'GitHub webhook secret not configured, skipping signature verification');
                return true;
            }

            if (!signature) {
                this.recordSecurityEvent('missing_signature', 'No signature provided');
                this.metrics.invalidSignatures++;
                return false;
            }

            // Extract signature from header (format: sha256=<signature>)
            const sigMatch = signature.match(/^sha256=([a-f0-9]+)$/);
            if (!sigMatch) {
                this.recordSecurityEvent('invalid_signature_format', `Invalid signature format: ${signature}`);
                this.metrics.invalidSignatures++;
                return false;
            }

            const providedSignature = sigMatch[1];

            // Calculate expected signature
            const expectedSignature = crypto
                .createHmac(this.config.github.algorithm, this.config.github.secret)
                .update(payload)
                .digest(this.config.github.encoding);

            // Use timing-safe comparison
            const isValid = crypto.timingSafeEqual(
                Buffer.from(providedSignature, this.config.github.encoding),
                Buffer.from(expectedSignature, this.config.github.encoding)
            );

            if (isValid) {
                this.metrics.validSignatures++;
                log('debug', 'Webhook signature verified successfully');
            } else {
                this.recordSecurityEvent('signature_mismatch', 'Signature verification failed');
                this.metrics.invalidSignatures++;
                log('warning', 'Webhook signature verification failed');
            }

            return isValid;

        } catch (error) {
            this.recordSecurityEvent('signature_error', `Signature verification error: ${error.message}`);
            this.metrics.invalidSignatures++;
            log('error', `Signature verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate webhook payload structure
     * @param {Object} payload - Parsed payload object
     * @param {string} eventType - GitHub event type
     * @returns {Object} Validation result
     */
    validatePayload(payload, eventType) {
        if (!this.config.validation.enablePayloadValidation) {
            return { valid: true };
        }

        try {
            // Check if event type is allowed
            if (!this.config.validation.allowedEvents.includes(eventType)) {
                this.recordSecurityEvent('disallowed_event', `Event type not allowed: ${eventType}`);
                return {
                    valid: false,
                    errors: [`Event type '${eventType}' is not allowed`]
                };
            }

            // Get schema for event type
            const schema = this.getSchemaForEvent(eventType);
            if (!schema) {
                log('warning', `No schema available for event type: ${eventType}`);
                return { valid: true }; // Allow if no schema defined
            }

            // Validate against schema
            const validate = this.ajv.compile(schema);
            const isValid = validate(payload);

            if (isValid) {
                this.metrics.validPayloads++;
                log('debug', `Payload validation successful for event: ${eventType}`);
                return { valid: true };
            } else {
                this.metrics.invalidPayloads++;
                const errors = validate.errors?.map(error => 
                    `${error.instancePath} ${error.message}`
                ) || ['Unknown validation error'];
                
                this.recordSecurityEvent('payload_validation_failed', 
                    `Payload validation failed for ${eventType}: ${errors.join(', ')}`);
                
                log('warning', `Payload validation failed for ${eventType}: ${errors.join(', ')}`);
                return {
                    valid: false,
                    errors: errors
                };
            }

        } catch (error) {
            this.recordSecurityEvent('validation_error', `Payload validation error: ${error.message}`);
            log('error', `Payload validation error: ${error.message}`);
            return {
                valid: false,
                errors: [`Validation error: ${error.message}`]
            };
        }
    }

    /**
     * Validate request security
     * @param {Object} req - Express request object
     * @returns {Object} Security validation result
     */
    validateRequestSecurity(req) {
        const violations = [];

        try {
            // IP whitelist validation
            if (this.config.security.enableIPWhitelist && this.config.security.allowedIPs.length > 0) {
                const clientIP = this.getClientIP(req);
                if (!this.isIPAllowed(clientIP)) {
                    violations.push(`IP not whitelisted: ${clientIP}`);
                    this.recordSecurityEvent('ip_not_whitelisted', `Blocked request from IP: ${clientIP}`);
                }
            }

            // User-Agent validation
            if (this.config.security.enableUserAgentValidation) {
                const userAgent = req.get('User-Agent');
                if (!this.isUserAgentAllowed(userAgent)) {
                    violations.push(`Invalid User-Agent: ${userAgent}`);
                    this.recordSecurityEvent('invalid_user_agent', `Invalid User-Agent: ${userAgent}`);
                }
            }

            // Required headers validation
            for (const header of this.config.validation.requiredHeaders) {
                if (!req.get(header)) {
                    violations.push(`Missing required header: ${header}`);
                }
            }

            // Timestamp validation (if GitHub-Delivery header contains timestamp)
            if (this.config.security.enableTimestampValidation) {
                const delivery = req.get('X-GitHub-Delivery');
                if (delivery && this.isTimestampTooOld(delivery)) {
                    violations.push('Request timestamp too old');
                    this.recordSecurityEvent('old_timestamp', `Old timestamp in delivery: ${delivery}`);
                }
            }

            // Content-Length validation
            const contentLength = parseInt(req.get('Content-Length') || '0');
            if (contentLength > this.config.validation.maxPayloadSize) {
                violations.push(`Payload too large: ${contentLength} bytes`);
                this.recordSecurityEvent('payload_too_large', `Payload size: ${contentLength} bytes`);
            }

            if (violations.length > 0) {
                this.metrics.blockedRequests++;
                this.metrics.securityViolations += violations.length;
            }

            return {
                valid: violations.length === 0,
                violations: violations
            };

        } catch (error) {
            this.recordSecurityEvent('security_validation_error', `Security validation error: ${error.message}`);
            return {
                valid: false,
                violations: [`Security validation error: ${error.message}`]
            };
        }
    }

    /**
     * Get client IP address
     * @param {Object} req - Express request object
     * @returns {string} Client IP address
     * @private
     */
    getClientIP(req) {
        return req.ip || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               'unknown';
    }

    /**
     * Check if IP is allowed
     * @param {string} ip - IP address to check
     * @returns {boolean} Whether IP is allowed
     * @private
     */
    isIPAllowed(ip) {
        if (this.config.security.allowedIPs.length === 0) {
            return true;
        }

        return this.config.security.allowedIPs.some(allowedIP => {
            if (typeof allowedIP === 'string') {
                return ip === allowedIP;
            } else if (allowedIP instanceof RegExp) {
                return allowedIP.test(ip);
            }
            return false;
        });
    }

    /**
     * Check if User-Agent is allowed
     * @param {string} userAgent - User-Agent header value
     * @returns {boolean} Whether User-Agent is allowed
     * @private
     */
    isUserAgentAllowed(userAgent) {
        if (!userAgent) {
            return false;
        }

        return this.config.security.allowedUserAgents.some(pattern => {
            if (typeof pattern === 'string') {
                return userAgent === pattern;
            } else if (pattern instanceof RegExp) {
                return pattern.test(userAgent);
            }
            return false;
        });
    }

    /**
     * Check if timestamp is too old
     * @param {string} delivery - GitHub delivery ID (may contain timestamp)
     * @returns {boolean} Whether timestamp is too old
     * @private
     */
    isTimestampTooOld(delivery) {
        try {
            // GitHub delivery IDs are UUIDs, but we can check request time
            // This is a simplified check - in practice, you might want to use
            // a custom header or extract timestamp from the delivery ID if possible
            return false; // Simplified for now
        } catch (error) {
            return false;
        }
    }

    /**
     * Record security event
     * @param {string} type - Event type
     * @param {string} description - Event description
     * @param {Object} metadata - Additional metadata
     * @private
     */
    recordSecurityEvent(type, description, metadata = {}) {
        const event = {
            type: type,
            description: description,
            timestamp: new Date(),
            metadata: metadata
        };

        this.securityEvents.push(event);
        this.metrics.lastSecurityEvent = event;

        // Keep only recent events
        if (this.securityEvents.length > this.maxSecurityEvents) {
            this.securityEvents = this.securityEvents.slice(-this.maxSecurityEvents);
        }

        if (this.config.monitoring.logSecurityEvents) {
            log('warning', `Security event: ${type} - ${description}`);
        }

        this.emit('security:event', event);
    }

    /**
     * Setup JSON schemas for payload validation
     * @private
     */
    setupSchemas() {
        // Pull Request Event Schema
        this.schemas = {
            pull_request: {
                type: 'object',
                required: ['action', 'pull_request', 'repository'],
                properties: {
                    action: {
                        type: 'string',
                        enum: ['opened', 'closed', 'reopened', 'synchronize', 'ready_for_review', 'converted_to_draft']
                    },
                    pull_request: {
                        type: 'object',
                        required: ['number', 'title', 'state', 'head', 'base'],
                        properties: {
                            number: { type: 'integer' },
                            title: { type: 'string' },
                            state: { type: 'string', enum: ['open', 'closed'] },
                            head: {
                                type: 'object',
                                required: ['ref', 'sha'],
                                properties: {
                                    ref: { type: 'string' },
                                    sha: { type: 'string', pattern: '^[a-f0-9]{40}$' }
                                }
                            },
                            base: {
                                type: 'object',
                                required: ['ref', 'sha'],
                                properties: {
                                    ref: { type: 'string' },
                                    sha: { type: 'string', pattern: '^[a-f0-9]{40}$' }
                                }
                            }
                        }
                    },
                    repository: {
                        type: 'object',
                        required: ['name', 'full_name'],
                        properties: {
                            name: { type: 'string' },
                            full_name: { type: 'string' }
                        }
                    }
                }
            },

            // Push Event Schema
            push: {
                type: 'object',
                required: ['ref', 'commits', 'repository'],
                properties: {
                    ref: { type: 'string' },
                    commits: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['id', 'message'],
                            properties: {
                                id: { type: 'string', pattern: '^[a-f0-9]{40}$' },
                                message: { type: 'string' }
                            }
                        }
                    },
                    repository: {
                        type: 'object',
                        required: ['name', 'full_name'],
                        properties: {
                            name: { type: 'string' },
                            full_name: { type: 'string' }
                        }
                    }
                }
            },

            // Check Run Event Schema
            check_run: {
                type: 'object',
                required: ['action', 'check_run', 'repository'],
                properties: {
                    action: {
                        type: 'string',
                        enum: ['created', 'completed', 'rerequested', 'requested_action']
                    },
                    check_run: {
                        type: 'object',
                        required: ['id', 'name', 'status'],
                        properties: {
                            id: { type: 'integer' },
                            name: { type: 'string' },
                            status: { type: 'string', enum: ['queued', 'in_progress', 'completed'] },
                            conclusion: { 
                                type: ['string', 'null'],
                                enum: ['success', 'failure', 'neutral', 'cancelled', 'timed_out', 'action_required', null]
                            }
                        }
                    },
                    repository: {
                        type: 'object',
                        required: ['name', 'full_name'],
                        properties: {
                            name: { type: 'string' },
                            full_name: { type: 'string' }
                        }
                    }
                }
            },

            // Check Suite Event Schema
            check_suite: {
                type: 'object',
                required: ['action', 'check_suite', 'repository'],
                properties: {
                    action: {
                        type: 'string',
                        enum: ['completed', 'requested', 'rerequested']
                    },
                    check_suite: {
                        type: 'object',
                        required: ['id', 'status'],
                        properties: {
                            id: { type: 'integer' },
                            status: { type: 'string', enum: ['queued', 'in_progress', 'completed'] },
                            conclusion: {
                                type: ['string', 'null'],
                                enum: ['success', 'failure', 'neutral', 'cancelled', 'timed_out', 'action_required', null]
                            }
                        }
                    },
                    repository: {
                        type: 'object',
                        required: ['name', 'full_name'],
                        properties: {
                            name: { type: 'string' },
                            full_name: { type: 'string' }
                        }
                    }
                }
            }
        };
    }

    /**
     * Get schema for event type
     * @param {string} eventType - GitHub event type
     * @returns {Object|null} JSON schema or null if not found
     * @private
     */
    getSchemaForEvent(eventType) {
        return this.schemas[eventType] || null;
    }

    /**
     * Validate configuration
     * @private
     */
    validateConfiguration() {
        if (this.config.security.enableIPWhitelist && this.config.security.allowedIPs.length === 0) {
            log('warning', 'IP whitelist enabled but no allowed IPs configured');
        }

        if (!this.config.github.secret) {
            log('warning', 'GitHub webhook secret not configured - signature verification disabled');
        }
    }

    /**
     * Get security metrics
     * @returns {Object} Security metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            recentSecurityEvents: this.securityEvents.slice(-10), // Last 10 events
            signatureSuccessRate: this.metrics.totalRequests > 0 ?
                this.metrics.validSignatures / this.metrics.totalRequests : 0,
            payloadValidationRate: (this.metrics.validPayloads + this.metrics.invalidPayloads) > 0 ?
                this.metrics.validPayloads / (this.metrics.validPayloads + this.metrics.invalidPayloads) : 0
        };
    }

    /**
     * Get security health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const recentViolations = this.securityEvents
            .filter(event => Date.now() - event.timestamp.getTime() < 300000) // Last 5 minutes
            .length;

        return {
            status: recentViolations > 10 ? 'degraded' : 'healthy',
            recentViolations: recentViolations,
            metrics: this.getMetrics(),
            configuration: {
                signatureVerification: !!this.config.github.secret,
                payloadValidation: this.config.validation.enablePayloadValidation,
                ipWhitelist: this.config.security.enableIPWhitelist,
                userAgentValidation: this.config.security.enableUserAgentValidation
            }
        };
    }

    /**
     * Get recent security events
     * @param {number} limit - Maximum number of events to return
     * @returns {Array} Recent security events
     */
    getRecentSecurityEvents(limit = 50) {
        return this.securityEvents.slice(-limit);
    }

    /**
     * Clear security events history
     */
    clearSecurityEvents() {
        this.securityEvents = [];
        log('info', 'Security events history cleared');
    }

    /**
     * Add custom validation rule
     * @param {string} eventType - Event type to add rule for
     * @param {Object} schema - JSON schema for validation
     */
    addValidationRule(eventType, schema) {
        this.schemas[eventType] = schema;
        log('info', `Custom validation rule added for event type: ${eventType}`);
    }

    /**
     * Remove validation rule
     * @param {string} eventType - Event type to remove rule for
     */
    removeValidationRule(eventType) {
        delete this.schemas[eventType];
        log('info', `Validation rule removed for event type: ${eventType}`);
    }

    /**
     * Shutdown the security manager
     */
    async shutdown() {
        try {
            // Clear sensitive data
            this.config.github.secret = null;
            this.securityEvents = [];
            
            log('info', 'Webhook Security Manager shutdown completed');
        } catch (error) {
            log('error', `Error during security manager shutdown: ${error.message}`);
            throw error;
        }
    }
}

export default WebhookSecurity;

