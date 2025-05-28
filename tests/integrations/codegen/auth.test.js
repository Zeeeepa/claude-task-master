/**
 * @fileoverview Tests for Codegen Authentication Module
 */

import { jest } from '@jest/globals';
import { CodegenAuth } from '../../../src/integrations/codegen/auth.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('CodegenAuth', () => {
    let auth;
    const mockConfig = {
        apiKey: 'test-api-key',
        orgId: 'test-org-id',
        baseURL: 'https://api.test.com'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        auth = new CodegenAuth(mockConfig);
    });

    afterEach(async () => {
        if (auth) {
            await auth.shutdown();
        }
    });

    describe('constructor', () => {
        it('should create auth instance with valid config', () => {
            expect(auth.config.apiKey).toBe('test-api-key');
            expect(auth.config.orgId).toBe('test-org-id');
            expect(auth.config.baseURL).toBe('https://api.test.com');
        });

        it('should throw error without API key', () => {
            expect(() => {
                new CodegenAuth({ orgId: 'test-org' });
            }).toThrow('Codegen API key is required');
        });

        it('should throw error without org ID', () => {
            expect(() => {
                new CodegenAuth({ apiKey: 'test-key' });
            }).toThrow('Codegen organization ID is required');
        });
    });

    describe('validateToken', () => {
        it('should validate token successfully', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    expires_at: '2024-12-31T23:59:59Z',
                    permissions: ['read', 'write'],
                    quota_remaining: 1000
                })
            };

            fetch.mockResolvedValue(mockResponse);

            const result = await auth.validateToken();

            expect(result).toBe(true);
            expect(auth.tokenInfo.valid).toBe(true);
            expect(auth.tokenInfo.permissions).toEqual(['read', 'write']);
            expect(fetch).toHaveBeenCalledWith(
                'https://api.test.com/v1/auth/validate',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-api-key',
                        'X-Org-ID': 'test-org-id'
                    })
                })
            );
        });

        it('should handle invalid token', async () => {
            const mockResponse = {
                ok: false,
                status: 401
            };

            fetch.mockResolvedValue(mockResponse);

            const result = await auth.validateToken();

            expect(result).toBe(false);
            expect(auth.tokenInfo.valid).toBe(false);
        });

        it('should handle network errors', async () => {
            fetch.mockRejectedValue(new Error('Network error'));

            const result = await auth.validateToken();

            expect(result).toBe(false);
            expect(auth.tokenInfo.valid).toBe(false);
            expect(auth.tokenInfo.error).toBe('Network error');
        });
    });

    describe('initialize', () => {
        it('should initialize successfully with valid token', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    expires_at: '2024-12-31T23:59:59Z',
                    permissions: ['read', 'write']
                })
            };

            fetch.mockResolvedValue(mockResponse);

            const result = await auth.initialize();

            expect(result).toBe(true);
            expect(auth.isAuthenticated()).toBe(true);
        });

        it('should fail initialization with invalid token', async () => {
            const mockResponse = {
                ok: false,
                status: 401
            };

            fetch.mockResolvedValue(mockResponse);

            await expect(auth.initialize()).rejects.toThrow('Invalid API key or organization ID');
        });
    });

    describe('getAuthHeaders', () => {
        it('should return auth headers when authenticated', async () => {
            // Mock successful validation
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({})
            };
            fetch.mockResolvedValue(mockResponse);
            await auth.initialize();

            const headers = auth.getAuthHeaders();

            expect(headers).toEqual({
                'Authorization': 'Bearer test-api-key',
                'X-Org-ID': 'test-org-id',
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/1.0.0'
            });
        });

        it('should throw error when not authenticated', () => {
            expect(() => {
                auth.getAuthHeaders();
            }).toThrow('Not authenticated with Codegen API');
        });
    });

    describe('needsRefresh', () => {
        it('should return false when no expiry date', () => {
            auth.tokenInfo = { valid: true };
            expect(auth.needsRefresh()).toBe(false);
        });

        it('should return true when token expires soon', () => {
            const soonExpiry = new Date(Date.now() + 60000); // 1 minute from now
            auth.tokenInfo = {
                valid: true,
                expiresAt: soonExpiry
            };

            expect(auth.needsRefresh()).toBe(true);
        });

        it('should return false when token expires later', () => {
            const laterExpiry = new Date(Date.now() + 600000); // 10 minutes from now
            auth.tokenInfo = {
                valid: true,
                expiresAt: laterExpiry
            };

            expect(auth.needsRefresh()).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('should return status information', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({})
            };
            fetch.mockResolvedValue(mockResponse);
            await auth.initialize();

            const status = auth.getStatus();

            expect(status).toHaveProperty('authenticated');
            expect(status).toHaveProperty('tokenInfo');
            expect(status).toHaveProperty('needsRefresh');
            expect(status).toHaveProperty('config');
            expect(status.config.hasApiKey).toBe(true);
        });
    });
});

