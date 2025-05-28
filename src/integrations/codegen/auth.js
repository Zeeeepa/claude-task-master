/**
 * @fileoverview Codegen Authentication Module
 * @description Handles authentication and authorization for Codegen API integration
 */

import { EventEmitter } from 'events';

/**
 * Codegen Authentication Manager
 * Handles token management, validation, and renewal
 */
export class CodegenAuth extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
            orgId: config.orgId || process.env.CODEGEN_ORG_ID,
            baseURL: config.baseURL || 'https://api.codegen.sh',
            tokenRefreshThreshold: config.tokenRefreshThreshold || 300000, // 5 minutes
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        this.tokenInfo = null;
        this.refreshTimer = null;
        this.isValidating = false;
        
        this._validateConfig();
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        if (!this.config.apiKey) {
            throw new Error('Codegen API key is required');
        }
        
        if (!this.config.orgId) {
            throw new Error('Codegen organization ID is required');
        }
    }

    /**
     * Initialize authentication
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            console.log('🔐 Initializing Codegen authentication...');
            
            // Validate API key
            const isValid = await this.validateToken();
            
            if (isValid) {
                this._startTokenRefreshTimer();
                this.emit('authenticated');
                console.log('✅ Codegen authentication initialized successfully');
                return true;
            } else {
                throw new Error('Invalid API key or organization ID');
            }
            
        } catch (error) {
            console.error('❌ Failed to initialize Codegen authentication:', error);
            this.emit('auth_error', error);
            throw error;
        }
    }

    /**
     * Validate API token
     * @returns {Promise<boolean>} Token validity
     */
    async validateToken() {
        if (this.isValidating) {
            return false;
        }

        this.isValidating = true;
        
        try {
            const response = await fetch(`${this.config.baseURL}/v1/auth/validate`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Org-ID': this.config.orgId,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.tokenInfo = {
                    valid: true,
                    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
                    permissions: data.permissions || [],
                    quotaRemaining: data.quota_remaining || null,
                    validatedAt: new Date()
                };
                
                this.emit('token_validated', this.tokenInfo);
                return true;
            } else {
                this.tokenInfo = { valid: false, validatedAt: new Date() };
                return false;
            }
            
        } catch (error) {
            console.error('Error validating Codegen token:', error);
            this.tokenInfo = { valid: false, error: error.message, validatedAt: new Date() };
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
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Codegen API');
        }

        return {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'X-Org-ID': this.config.orgId,
            'Content-Type': 'application/json',
            'User-Agent': 'claude-task-master/1.0.0'
        };
    }

    /**
     * Check if currently authenticated
     * @returns {boolean} Authentication status
     */
    isAuthenticated() {
        return this.tokenInfo && this.tokenInfo.valid;
    }

    /**
     * Get token information
     * @returns {Object|null} Token information
     */
    getTokenInfo() {
        return this.tokenInfo;
    }

    /**
     * Check if token needs refresh
     * @returns {boolean} Whether token needs refresh
     */
    needsRefresh() {
        if (!this.tokenInfo || !this.tokenInfo.expiresAt) {
            return false;
        }

        const now = new Date();
        const timeUntilExpiry = this.tokenInfo.expiresAt.getTime() - now.getTime();
        
        return timeUntilExpiry <= this.config.tokenRefreshThreshold;
    }

    /**
     * Refresh authentication token
     * @returns {Promise<boolean>} Success status
     */
    async refreshToken() {
        try {
            console.log('🔄 Refreshing Codegen authentication token...');
            
            const isValid = await this.validateToken();
            
            if (isValid) {
                this.emit('token_refreshed', this.tokenInfo);
                console.log('✅ Codegen token refreshed successfully');
                return true;
            } else {
                throw new Error('Token refresh failed - invalid credentials');
            }
            
        } catch (error) {
            console.error('❌ Failed to refresh Codegen token:', error);
            this.emit('token_refresh_failed', error);
            throw error;
        }
    }

    /**
     * Start automatic token refresh timer
     * @private
     */
    _startTokenRefreshTimer() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        // Check every 5 minutes
        this.refreshTimer = setInterval(async () => {
            try {
                if (this.needsRefresh()) {
                    await this.refreshToken();
                }
            } catch (error) {
                console.error('Automatic token refresh failed:', error);
            }
        }, 300000); // 5 minutes
    }

    /**
     * Stop automatic token refresh
     * @private
     */
    _stopTokenRefreshTimer() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Get authentication status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            authenticated: this.isAuthenticated(),
            tokenInfo: this.tokenInfo,
            needsRefresh: this.needsRefresh(),
            config: {
                orgId: this.config.orgId,
                baseURL: this.config.baseURL,
                hasApiKey: !!this.config.apiKey
            }
        };
    }

    /**
     * Shutdown authentication manager
     */
    async shutdown() {
        console.log('🔐 Shutting down Codegen authentication...');
        
        this._stopTokenRefreshTimer();
        this.tokenInfo = null;
        this.removeAllListeners();
        
        console.log('✅ Codegen authentication shutdown complete');
    }
}

export default CodegenAuth;

