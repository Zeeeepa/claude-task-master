/**
 * @fileoverview ApiKey Model
 * @description Secure API key storage and management model
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * ApiKey model class
 */
export class ApiKey {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.name = data.name || '';
        this.service = data.service || '';
        this.key_hash = data.key_hash || null;
        this.key_prefix = data.key_prefix || null;
        this.permissions = data.permissions || [];
        this.environment = data.environment || 'development';
        this.is_active = data.is_active !== undefined ? data.is_active : true;
        this.expires_at = data.expires_at || null;
        this.last_used_at = data.last_used_at || null;
        this.usage_count = data.usage_count || 0;
        this.rate_limit = data.rate_limit || null;
        this.created_by = data.created_by || null;
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
        this.metadata = data.metadata || {};
    }

    /**
     * Validate API key data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.name || this.name.trim().length === 0) {
            errors.push('Name is required');
        }

        if (!this.service || this.service.trim().length === 0) {
            errors.push('Service is required');
        }

        if (this.name && this.name.length > 100) {
            errors.push('Name must be 100 characters or less');
        }

        // Service validation
        const validServices = [
            'codegen', 'linear', 'claude_code', 'agentapi', 'github',
            'openai', 'anthropic', 'database', 'monitoring', 'webhook'
        ];
        if (!validServices.includes(this.service)) {
            errors.push(`Service must be one of: ${validServices.join(', ')}`);
        }

        // Environment validation
        const validEnvironments = ['development', 'staging', 'production'];
        if (!validEnvironments.includes(this.environment)) {
            errors.push(`Environment must be one of: ${validEnvironments.join(', ')}`);
        }

        // Permissions validation
        if (!Array.isArray(this.permissions)) {
            errors.push('Permissions must be an array');
        }

        // Business logic validations
        if (this.expires_at && new Date(this.expires_at) <= new Date()) {
            warnings.push('API key has expired');
        }

        if (this.is_active && this.expires_at && new Date(this.expires_at) <= new Date()) {
            warnings.push('Active API key is expired');
        }

        if (this.usage_count > 10000 && !this.rate_limit) {
            warnings.push('High usage API key should have rate limiting');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Convert to database format
     * @returns {Object} Database-ready object
     */
    toDatabase() {
        return {
            id: this.id,
            name: this.name,
            service: this.service,
            key_hash: this.key_hash,
            key_prefix: this.key_prefix,
            permissions: JSON.stringify(this.permissions),
            environment: this.environment,
            is_active: this.is_active,
            expires_at: this.expires_at,
            last_used_at: this.last_used_at,
            usage_count: this.usage_count,
            rate_limit: this.rate_limit ? JSON.stringify(this.rate_limit) : null,
            created_by: this.created_by,
            created_at: this.created_at,
            updated_at: this.updated_at,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {ApiKey} ApiKey instance
     */
    static fromDatabase(row) {
        return new ApiKey({
            id: row.id,
            name: row.name,
            service: row.service,
            key_hash: row.key_hash,
            key_prefix: row.key_prefix,
            permissions: typeof row.permissions === 'string' 
                ? JSON.parse(row.permissions) 
                : row.permissions,
            environment: row.environment,
            is_active: row.is_active,
            expires_at: row.expires_at,
            last_used_at: row.last_used_at,
            usage_count: row.usage_count,
            rate_limit: row.rate_limit 
                ? (typeof row.rate_limit === 'string' ? JSON.parse(row.rate_limit) : row.rate_limit)
                : null,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata
        });
    }

    /**
     * Hash an API key for secure storage
     * @param {string} apiKey - Plain text API key
     * @returns {Object} Hash and prefix
     */
    static hashApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('API key must be a non-empty string');
        }

        const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const prefix = apiKey.substring(0, 8) + '...';
        
        return { hash, prefix };
    }

    /**
     * Set API key (hashes and stores securely)
     * @param {string} apiKey - Plain text API key
     */
    setApiKey(apiKey) {
        const { hash, prefix } = ApiKey.hashApiKey(apiKey);
        this.key_hash = hash;
        this.key_prefix = prefix;
        this.updated_at = new Date();
    }

    /**
     * Verify API key against stored hash
     * @param {string} apiKey - Plain text API key to verify
     * @returns {boolean} True if key matches
     */
    verifyApiKey(apiKey) {
        if (!this.key_hash || !apiKey) {
            return false;
        }

        const { hash } = ApiKey.hashApiKey(apiKey);
        return crypto.timingSafeEqual(
            Buffer.from(this.key_hash, 'hex'),
            Buffer.from(hash, 'hex')
        );
    }

    /**
     * Record API key usage
     * @param {Object} context - Usage context
     */
    recordUsage(context = {}) {
        this.usage_count += 1;
        this.last_used_at = new Date();
        
        // Update metadata with usage context
        this.metadata = {
            ...this.metadata,
            last_usage_context: {
                timestamp: new Date(),
                ...context
            }
        };
    }

    /**
     * Check if API key is expired
     * @returns {boolean} True if expired
     */
    isExpired() {
        if (!this.expires_at) {
            return false;
        }
        return new Date(this.expires_at) <= new Date();
    }

    /**
     * Check if API key is valid for use
     * @returns {boolean} True if valid
     */
    isValid() {
        return this.is_active && !this.isExpired() && this.key_hash;
    }

    /**
     * Check if API key has permission
     * @param {string} permission - Permission to check
     * @returns {boolean} True if has permission
     */
    hasPermission(permission) {
        return this.permissions.includes(permission) || this.permissions.includes('*');
    }

    /**
     * Check rate limit
     * @returns {Object} Rate limit status
     */
    checkRateLimit() {
        if (!this.rate_limit) {
            return { allowed: true, remaining: null };
        }

        const now = new Date();
        const windowStart = new Date(now.getTime() - (this.rate_limit.window_ms || 3600000)); // 1 hour default
        
        // This would need to be implemented with actual usage tracking
        // For now, return basic structure
        return {
            allowed: true,
            remaining: this.rate_limit.max_requests || 1000,
            reset_at: new Date(now.getTime() + (this.rate_limit.window_ms || 3600000))
        };
    }

    /**
     * Deactivate API key
     * @param {string} reason - Reason for deactivation
     */
    deactivate(reason = null) {
        this.is_active = false;
        this.updated_at = new Date();
        
        if (reason) {
            this.metadata = {
                ...this.metadata,
                deactivation: {
                    reason,
                    timestamp: new Date()
                }
            };
        }
    }

    /**
     * Get API key summary (safe for display)
     * @returns {Object} Safe summary
     */
    getSummary() {
        return {
            id: this.id,
            name: this.name,
            service: this.service,
            key_prefix: this.key_prefix,
            permissions: this.permissions,
            environment: this.environment,
            is_active: this.is_active,
            is_expired: this.isExpired(),
            is_valid: this.isValid(),
            usage_count: this.usage_count,
            last_used_at: this.last_used_at,
            expires_at: this.expires_at,
            created_at: this.created_at
        };
    }

    /**
     * Get security audit information
     * @returns {Object} Security audit data
     */
    getSecurityAudit() {
        return {
            id: this.id,
            name: this.name,
            service: this.service,
            environment: this.environment,
            permissions: this.permissions,
            security_status: {
                is_active: this.is_active,
                is_expired: this.isExpired(),
                has_expiration: !!this.expires_at,
                has_rate_limit: !!this.rate_limit,
                usage_count: this.usage_count,
                last_used_at: this.last_used_at
            },
            created_by: this.created_by,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

export default ApiKey;

