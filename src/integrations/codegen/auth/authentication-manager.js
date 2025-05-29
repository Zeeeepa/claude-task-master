/**
 * @fileoverview Unified Authentication Manager
 * @description Consolidated authentication management for Codegen SDK integration
 */

import { EventEmitter } from 'events';
import { log } from '../../../utils/logger.js';

/**
 * Authentication error
 */
export class AuthenticationError extends Error {
    constructor(message, code = null) {
        super(message);
        this.name = 'AuthenticationError';
        this.code = code;
    }
}

/**
 * Unified Authentication Manager
 * Consolidates authentication patterns from PRs #52, #87
 */
export class AuthenticationManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            type: config.type || 'bearer',
            apiKey: config.apiKey,
            orgId: config.orgId,
            validateOnInit: config.validateOnInit !== false,
            tokenRefresh: config.tokenRefresh !== false,
            tokenExpiry: config.tokenExpiry || 3600000, // 1 hour
            refreshThreshold: config.refreshThreshold || 300000, // 5 minutes
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        this.tokenInfo = null;
        this.refreshTimer = null;
        this.isValidating = false;
        this.isAuthenticated = false;
        this.lastValidation = null;
        
        log('debug', 'Authentication Manager initialized', {
            type: this.config.type,
            hasApiKey: !!this.config.apiKey,
            hasOrgId: !!this.config.orgId,
            validateOnInit: this.config.validateOnInit
        });
    }

    /**
     * Initialize authentication
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            log('info', 'Initializing authentication...');
            
            if (!this.config.apiKey) {
                if (this.config.validateOnInit) {
                    throw new AuthenticationError('API key is required for authentication');
                } else {
                    log('warn', 'No API key provided, authentication disabled');
                    return false;
                }
            }

            // Validate credentials
            if (this.config.validateOnInit) {
                const isValid = await this.validateCredentials();
                if (!isValid) {
                    throw new AuthenticationError('Invalid API credentials');
                }
            }

            // Start token refresh timer if enabled
            if (this.config.tokenRefresh && this.tokenInfo?.expiresAt) {
                this._startRefreshTimer();
            }

            this.isAuthenticated = true;
            this.emit('authenticated', this.tokenInfo);
            
            log('info', 'Authentication initialized successfully');
            return true;
            
        } catch (error) {
            log('error', 'Failed to initialize authentication', { error: error.message });
            this.emit('auth:error', error);
            throw error;
        }
    }

    /**
     * Validate credentials with the API
     * @returns {Promise<boolean>} Validation result
     */
    async validateCredentials() {
        if (this.isValidating) {
            log('debug', 'Validation already in progress');
            return false;
        }

        this.isValidating = true;
        
        try {
            log('debug', 'Validating API credentials...');
            
            const response = await this._makeAuthRequest('/auth/validate');
            
            if (response.ok) {
                const data = await response.json();
                
                this.tokenInfo = {
                    valid: true,
                    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
                    permissions: data.permissions || [],
                    quotaRemaining: data.quota_remaining || null,
                    organization: data.organization || null,
                    validatedAt: new Date()
                };
                
                this.lastValidation = new Date();
                this.emit('token:validated', this.tokenInfo);
                
                log('debug', 'Credentials validated successfully', {
                    expiresAt: this.tokenInfo.expiresAt,
                    permissions: this.tokenInfo.permissions.length,
                    quotaRemaining: this.tokenInfo.quotaRemaining
                });
                
                return true;
            } else {
                const errorData = await response.json().catch(() => ({}));
                this.tokenInfo = { 
                    valid: false, 
                    error: errorData.message || 'Validation failed',
                    validatedAt: new Date() 
                };
                
                log('warn', 'Credential validation failed', {
                    status: response.status,
                    error: this.tokenInfo.error
                });
                
                return false;
            }
            
        } catch (error) {
            log('error', 'Error validating credentials', { error: error.message });
            this.tokenInfo = { 
                valid: false, 
                error: error.message, 
                validatedAt: new Date() 
            };
            return false;
        } finally {
            this.isValidating = false;
        }
    }

    /**
     * Get authentication headers for API requests
     * @returns {Object} Headers object
     */
    getAuthHeaders() {
        if (!this.isAuthenticated && !this.config.apiKey) {
            throw new AuthenticationError('Not authenticated');
        }

        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'claude-task-master/2.0.0'
        };

        if (this.config.apiKey) {
            switch (this.config.type) {
                case 'bearer':
                    headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                    break;
                case 'api-key':
                    headers['X-API-Key'] = this.config.apiKey;
                    break;
                default:
                    headers['Authorization'] = `${this.config.type} ${this.config.apiKey}`;
            }
        }

        if (this.config.orgId) {
            headers['X-Org-ID'] = this.config.orgId;
        }

        return headers;
    }

    /**
     * Check if currently authenticated
     * @returns {boolean} Authentication status
     */
    isAuthenticated() {
        return this.isAuthenticated && !!this.config.apiKey;
    }

    /**
     * Get token information
     * @returns {Object|null} Token information
     */
    getTokenInfo() {
        return this.tokenInfo ? { ...this.tokenInfo } : null;
    }

    /**
     * Check if token needs refresh
     * @returns {boolean} Whether token needs refresh
     */
    needsRefresh() {
        if (!this.tokenInfo?.expiresAt || !this.config.tokenRefresh) {
            return false;
        }

        const now = new Date();
        const expiresAt = new Date(this.tokenInfo.expiresAt);
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        
        return timeUntilExpiry <= this.config.refreshThreshold;
    }

    /**
     * Refresh authentication token
     * @returns {Promise<boolean>} Refresh result
     */
    async refreshToken() {
        try {
            log('debug', 'Refreshing authentication token...');
            
            const response = await this._makeAuthRequest('/auth/refresh', {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Update token info
                if (data.access_token) {
                    this.config.apiKey = data.access_token;
                }
                
                this.tokenInfo = {
                    ...this.tokenInfo,
                    valid: true,
                    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
                    refreshedAt: new Date()
                };
                
                this.emit('token:refreshed', this.tokenInfo);
                
                log('info', 'Token refreshed successfully');
                return true;
            } else {
                log('error', 'Failed to refresh token', { status: response.status });
                return false;
            }
            
        } catch (error) {
            log('error', 'Error refreshing token', { error: error.message });
            return false;
        }
    }

    /**
     * Get authentication status
     * @returns {Object} Authentication status
     */
    getStatus() {
        return {
            isAuthenticated: this.isAuthenticated,
            hasApiKey: !!this.config.apiKey,
            hasOrgId: !!this.config.orgId,
            tokenInfo: this.tokenInfo ? {
                valid: this.tokenInfo.valid,
                expiresAt: this.tokenInfo.expiresAt,
                validatedAt: this.tokenInfo.validatedAt,
                needsRefresh: this.needsRefresh()
            } : null,
            lastValidation: this.lastValidation,
            isValidating: this.isValidating
        };
    }

    /**
     * Perform health check
     * @returns {Promise<Object>} Health check result
     */
    async healthCheck() {
        try {
            if (!this.config.apiKey) {
                return {
                    status: 'healthy',
                    message: 'Authentication disabled (no API key)'
                };
            }

            // Check if token needs validation
            const now = new Date();
            const timeSinceValidation = this.lastValidation ? 
                now.getTime() - this.lastValidation.getTime() : Infinity;
            
            if (timeSinceValidation > 300000) { // 5 minutes
                const isValid = await this.validateCredentials();
                if (!isValid) {
                    return {
                        status: 'unhealthy',
                        error: 'Authentication validation failed'
                    };
                }
            }

            return {
                status: 'healthy',
                message: 'Authentication is valid',
                lastValidation: this.lastValidation
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Shutdown authentication manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('debug', 'Shutting down authentication manager...');
            
            // Clear refresh timer
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            
            this.isAuthenticated = false;
            this.emit('shutdown');
            
            log('debug', 'Authentication manager shutdown completed');
            
        } catch (error) {
            log('error', 'Error during authentication shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Make authenticated request to API
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Response>} Response object
     * @private
     */
    async _makeAuthRequest(endpoint, options = {}) {
        const url = `${this.config.baseUrl || 'https://api.codegen.sh'}${endpoint}`;
        
        const requestOptions = {
            method: 'GET',
            headers: this.getAuthHeaders(),
            ...options
        };

        let lastError;
        
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await fetch(url, requestOptions);
                
                if (response.status === 401) {
                    throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
                }
                
                if (response.status === 403) {
                    throw new AuthenticationError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS');
                }
                
                return response;
                
            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                    log('debug', `Auth request failed, retrying in ${delay}ms`, {
                        attempt,
                        error: error.message
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    log('error', 'Auth request failed after all retries', {
                        attempts: this.config.maxRetries,
                        error: error.message
                    });
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Start token refresh timer
     * @private
     */
    _startRefreshTimer() {
        if (!this.tokenInfo?.expiresAt) {
            return;
        }

        // Clear existing timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        const now = new Date();
        const expiresAt = new Date(this.tokenInfo.expiresAt);
        const timeUntilRefresh = Math.max(
            expiresAt.getTime() - now.getTime() - this.config.refreshThreshold,
            60000 // Minimum 1 minute
        );

        this.refreshTimer = setTimeout(async () => {
            try {
                await this.refreshToken();
                this._startRefreshTimer(); // Schedule next refresh
            } catch (error) {
                log('error', 'Automatic token refresh failed', { error: error.message });
                this.emit('auth:error', error);
            }
        }, timeUntilRefresh);

        log('debug', 'Token refresh timer started', {
            refreshIn: Math.round(timeUntilRefresh / 1000) + 's'
        });
    }
}

/**
 * Create authentication manager from environment
 * @returns {AuthenticationManager} Authentication manager instance
 */
export function createAuthenticationManager() {
    return new AuthenticationManager({
        apiKey: process.env.CODEGEN_API_KEY,
        orgId: process.env.CODEGEN_ORG_ID,
        validateOnInit: process.env.CODEGEN_VALIDATE_ON_INIT !== 'false',
        tokenRefresh: process.env.CODEGEN_TOKEN_REFRESH !== 'false'
    });
}

