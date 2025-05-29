/**
 * Auth Manager - Token and org_id handling for Codegen SDK
 * Manages authentication credentials, token refresh, and security
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { configManager } from '../../utils/config-manager.js';

class AuthManager extends EventEmitter {
    constructor() {
        super();
        this.credentials = null;
        this.tokenRefreshTimer = null;
        this.isAuthenticated = false;
        this.refreshThreshold = 300000; // 5 minutes before expiry
    }

    /**
     * Initialize authentication
     */
    async initialize() {
        try {
            logger.info('Initializing authentication manager...');
            
            // Load credentials from configuration
            await this.loadCredentials();
            
            // Verify credentials
            await this.verifyCredentials();
            
            // Setup token refresh
            this.setupTokenRefresh();
            
            this.isAuthenticated = true;
            this.emit('authenticated');
            
            logger.info('Authentication manager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize authentication manager:', error);
            throw error;
        }
    }

    /**
     * Load credentials from configuration
     */
    async loadCredentials() {
        const token = configManager.get('codegen.token') || process.env.CODEGEN_TOKEN;
        const orgId = configManager.get('codegen.orgId') || process.env.CODEGEN_ORG_ID;
        
        if (!token) {
            throw new Error('Codegen token not found. Set CODEGEN_TOKEN environment variable or configure it.');
        }
        
        if (!orgId) {
            throw new Error('Codegen org ID not found. Set CODEGEN_ORG_ID environment variable or configure it.');
        }
        
        this.credentials = {
            token,
            orgId,
            loadedAt: Date.now()
        };
        
        // Parse token to get expiry if it's a JWT
        try {
            const tokenPayload = this.parseJWT(token);
            if (tokenPayload.exp) {
                this.credentials.expiresAt = tokenPayload.exp * 1000; // Convert to milliseconds
            }
        } catch (error) {
            logger.debug('Token is not a JWT or could not be parsed:', error.message);
        }
        
        logger.debug('Credentials loaded successfully');
    }

    /**
     * Verify credentials with Codegen API
     */
    async verifyCredentials() {
        if (!this.credentials) {
            throw new Error('No credentials loaded');
        }
        
        try {
            const apiBaseUrl = configManager.get('codegen.apiBaseUrl', 'https://api.codegen.sh');
            const response = await fetch(`${apiBaseUrl}/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.credentials.token}`,
                    'X-Org-ID': this.credentials.orgId,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Authentication verification failed: ${errorData.message || response.statusText}`);
            }
            
            const verificationData = await response.json();
            
            // Update credentials with verification data
            this.credentials.verified = true;
            this.credentials.verifiedAt = Date.now();
            this.credentials.userInfo = verificationData.user || {};
            this.credentials.permissions = verificationData.permissions || [];
            
            logger.info('Credentials verified successfully', {
                userId: this.credentials.userInfo.id,
                orgId: this.credentials.orgId
            });
            
        } catch (error) {
            logger.error('Credential verification failed:', error);
            throw error;
        }
    }

    /**
     * Get current credentials
     */
    async getCredentials() {
        if (!this.credentials) {
            throw new Error('No credentials available');
        }
        
        // Check if token is about to expire
        if (this.isTokenExpiringSoon()) {
            await this.refreshToken();
        }
        
        return {
            token: this.credentials.token,
            orgId: this.credentials.orgId
        };
    }

    /**
     * Check if token is expiring soon
     */
    isTokenExpiringSoon() {
        if (!this.credentials || !this.credentials.expiresAt) {
            return false;
        }
        
        const now = Date.now();
        const timeUntilExpiry = this.credentials.expiresAt - now;
        
        return timeUntilExpiry <= this.refreshThreshold;
    }

    /**
     * Refresh authentication token
     */
    async refreshToken() {
        try {
            logger.info('Refreshing authentication token...');
            
            const apiBaseUrl = configManager.get('codegen.apiBaseUrl', 'https://api.codegen.sh');
            const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.credentials.token}`,
                    'X-Org-ID': this.credentials.orgId,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Token refresh failed: ${errorData.message || response.statusText}`);
            }
            
            const refreshData = await response.json();
            
            // Update credentials with new token
            this.credentials.token = refreshData.token;
            this.credentials.refreshedAt = Date.now();
            
            // Parse new token for expiry
            try {
                const tokenPayload = this.parseJWT(refreshData.token);
                if (tokenPayload.exp) {
                    this.credentials.expiresAt = tokenPayload.exp * 1000;
                }
            } catch (error) {
                logger.debug('New token is not a JWT or could not be parsed:', error.message);
            }
            
            this.emit('tokenRefreshed', {
                refreshedAt: this.credentials.refreshedAt,
                expiresAt: this.credentials.expiresAt
            });
            
            logger.info('Authentication token refreshed successfully');
            
        } catch (error) {
            logger.error('Token refresh failed:', error);
            this.emit('tokenRefreshFailed', error);
            throw error;
        }
    }

    /**
     * Setup automatic token refresh
     */
    setupTokenRefresh() {
        if (!this.credentials || !this.credentials.expiresAt) {
            logger.debug('No token expiry information available, skipping automatic refresh setup');
            return;
        }
        
        const now = Date.now();
        const timeUntilRefresh = this.credentials.expiresAt - now - this.refreshThreshold;
        
        if (timeUntilRefresh <= 0) {
            // Token is already expiring soon, refresh immediately
            this.refreshToken().catch(error => {
                logger.error('Immediate token refresh failed:', error);
            });
            return;
        }
        
        // Clear existing timer
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
        }
        
        // Setup new timer
        this.tokenRefreshTimer = setTimeout(async () => {
            try {
                await this.refreshToken();
                // Setup next refresh
                this.setupTokenRefresh();
            } catch (error) {
                logger.error('Scheduled token refresh failed:', error);
                // Retry after a shorter interval
                this.tokenRefreshTimer = setTimeout(() => {
                    this.setupTokenRefresh();
                }, 60000); // 1 minute
            }
        }, timeUntilRefresh);
        
        logger.debug(`Token refresh scheduled in ${Math.round(timeUntilRefresh / 1000)} seconds`);
    }

    /**
     * Parse JWT token
     */
    parseJWT(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }
        
        const payload = parts[1];
        const decoded = Buffer.from(payload, 'base64url').toString('utf8');
        return JSON.parse(decoded);
    }

    /**
     * Update credentials
     */
    async updateCredentials(newCredentials) {
        const oldCredentials = this.credentials;
        
        try {
            this.credentials = {
                ...this.credentials,
                ...newCredentials,
                updatedAt: Date.now()
            };
            
            // Verify new credentials
            await this.verifyCredentials();
            
            // Setup new token refresh if needed
            this.setupTokenRefresh();
            
            this.emit('credentialsUpdated', {
                oldCredentials: oldCredentials ? { orgId: oldCredentials.orgId } : null,
                newCredentials: { orgId: this.credentials.orgId }
            });
            
            logger.info('Credentials updated successfully');
            
        } catch (error) {
            // Restore old credentials on failure
            this.credentials = oldCredentials;
            logger.error('Failed to update credentials:', error);
            throw error;
        }
    }

    /**
     * Check if user has specific permission
     */
    hasPermission(permission) {
        if (!this.credentials || !this.credentials.permissions) {
            return false;
        }
        
        return this.credentials.permissions.includes(permission) || 
               this.credentials.permissions.includes('*');
    }

    /**
     * Get user information
     */
    getUserInfo() {
        return this.credentials ? this.credentials.userInfo : null;
    }

    /**
     * Get organization ID
     */
    getOrgId() {
        return this.credentials ? this.credentials.orgId : null;
    }

    /**
     * Check if authenticated
     */
    isAuthenticated() {
        return this.isAuthenticated && this.credentials && this.credentials.verified;
    }

    /**
     * Get authentication status
     */
    getStatus() {
        if (!this.credentials) {
            return {
                authenticated: false,
                reason: 'No credentials loaded'
            };
        }
        
        const now = Date.now();
        const status = {
            authenticated: this.isAuthenticated,
            orgId: this.credentials.orgId,
            verified: this.credentials.verified,
            verifiedAt: this.credentials.verifiedAt,
            hasExpiry: !!this.credentials.expiresAt,
            isExpiringSoon: this.isTokenExpiringSoon()
        };
        
        if (this.credentials.expiresAt) {
            status.expiresAt = this.credentials.expiresAt;
            status.timeUntilExpiry = this.credentials.expiresAt - now;
        }
        
        if (this.credentials.userInfo) {
            status.user = {
                id: this.credentials.userInfo.id,
                email: this.credentials.userInfo.email
            };
        }
        
        return status;
    }

    /**
     * Logout and clear credentials
     */
    async logout() {
        try {
            // Clear refresh timer
            if (this.tokenRefreshTimer) {
                clearTimeout(this.tokenRefreshTimer);
                this.tokenRefreshTimer = null;
            }
            
            // Optionally notify server of logout
            if (this.credentials && this.credentials.token) {
                try {
                    const apiBaseUrl = configManager.get('codegen.apiBaseUrl', 'https://api.codegen.sh');
                    await fetch(`${apiBaseUrl}/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.credentials.token}`,
                            'X-Org-ID': this.credentials.orgId,
                            'Content-Type': 'application/json'
                        },
                        timeout: 5000
                    });
                } catch (error) {
                    logger.debug('Server logout notification failed:', error.message);
                }
            }
            
            // Clear credentials
            this.credentials = null;
            this.isAuthenticated = false;
            
            this.emit('logout');
            logger.info('Logged out successfully');
            
        } catch (error) {
            logger.error('Logout error:', error);
            throw error;
        }
    }
}

export const authManager = new AuthManager();
export default AuthManager;

