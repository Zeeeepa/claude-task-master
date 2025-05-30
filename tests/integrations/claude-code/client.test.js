/**
 * Tests for Claude Code Integration Client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { ClaudeCodeIntegration } from '../../../src/integrations/claude-code/client.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('ClaudeCodeIntegration', () => {
    let client;
    let mockAxiosInstance;

    beforeEach(() => {
        mockAxiosInstance = {
            post: vi.fn(),
            get: vi.fn(),
            delete: vi.fn(),
            interceptors: {
                request: { use: vi.fn() },
                response: { use: vi.fn() }
            }
        };

        mockedAxios.create.mockReturnValue(mockAxiosInstance);
        
        client = new ClaudeCodeIntegration('http://localhost:8000', 'test-api-key');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with correct configuration', () => {
            expect(client.baseURL).toBe('http://localhost:8000');
            expect(client.apiKey).toBe('test-api-key');
            expect(mockedAxios.create).toHaveBeenCalledWith({
                baseURL: 'http://localhost:8000',
                headers: {
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
        });

        it('should setup request and response interceptors', () => {
            expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
            expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
        });
    });

    describe('deployAndValidate', () => {
        it('should deploy and validate PR successfully', async () => {
            const prData = {
                repository: 'test/repo',
                branch: 'feature/test',
                number: 123,
                baseBranch: 'main'
            };

            const mockResponse = {
                data: {
                    id: 'deployment-123',
                    status: 'validating',
                    environment: { id: 'env-123' }
                }
            };

            mockAxiosInstance.post.mockResolvedValue(mockResponse);

            const result = await client.deployAndValidate(prData);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/claude-code/deploy', {
                repository: 'test/repo',
                branch: 'feature/test',
                prNumber: 123,
                baseBranch: 'main',
                validationLayers: [
                    'syntax',
                    'unit_tests',
                    'integration_tests',
                    'performance',
                    'security'
                ],
                environment: {
                    type: 'wsl2',
                    resources: {
                        cpu: '2',
                        memory: '4GB',
                        disk: '20GB'
                    },
                    networking: 'isolated'
                }
            });

            expect(result).toEqual(mockResponse.data);
        });

        it('should handle deployment failure', async () => {
            const prData = {
                repository: 'test/repo',
                branch: 'feature/test',
                number: 123
            };

            const mockError = {
                response: {
                    data: { message: 'Deployment failed' }
                }
            };

            mockAxiosInstance.post.mockRejectedValue(mockError);

            await expect(client.deployAndValidate(prData))
                .rejects.toThrow('Deployment failed: Deployment failed');
        });
    });

    describe('monitorDeployment', () => {
        it('should monitor deployment successfully', async () => {
            const deploymentId = 'deployment-123';
            const mockResponse = {
                data: {
                    id: deploymentId,
                    status: 'running',
                    progress: 50
                }
            };

            mockAxiosInstance.get.mockResolvedValue(mockResponse);

            const result = await client.monitorDeployment(deploymentId);

            expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/claude-code/deployments/${deploymentId}`);
            expect(result).toEqual(mockResponse.data);
        });

        it('should handle monitoring failure', async () => {
            const deploymentId = 'deployment-123';
            const mockError = new Error('Network error');

            mockAxiosInstance.get.mockRejectedValue(mockError);

            await expect(client.monitorDeployment(deploymentId))
                .rejects.toThrow('Monitoring failed: Network error');
        });
    });

    describe('getDeploymentLogs', () => {
        it('should retrieve deployment logs successfully', async () => {
            const deploymentId = 'deployment-123';
            const mockResponse = {
                data: {
                    logs: ['Log line 1', 'Log line 2'],
                    output: 'Combined output'
                }
            };

            mockAxiosInstance.get.mockResolvedValue(mockResponse);

            const result = await client.getDeploymentLogs(deploymentId);

            expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/claude-code/deployments/${deploymentId}/logs`);
            expect(result).toEqual(mockResponse.data);
        });
    });

    describe('triggerAutoFix', () => {
        it('should trigger auto-fix successfully', async () => {
            const deploymentId = 'deployment-123';
            const errors = ['Error 1', 'Error 2'];
            const mockResponse = {
                data: {
                    id: 'autofix-123',
                    status: 'running'
                }
            };

            mockAxiosInstance.post.mockResolvedValue(mockResponse);

            const result = await client.triggerAutoFix(deploymentId, errors);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith(
                `/claude-code/deployments/${deploymentId}/auto-fix`,
                {
                    errors,
                    maxAttempts: 3,
                    fixStrategies: ['dependency_resolution', 'syntax_correction', 'test_fixes'],
                    timeout: 600000
                }
            );

            expect(result).toEqual(mockResponse.data);
        });
    });

    describe('runValidation', () => {
        it('should run validation layer successfully', async () => {
            const deploymentId = 'deployment-123';
            const validationType = 'syntax';
            const options = { languages: ['javascript'] };
            const mockResponse = {
                data: {
                    status: 'passed',
                    results: { linting: 'passed' }
                }
            };

            mockAxiosInstance.post.mockResolvedValue(mockResponse);

            const result = await client.runValidation(deploymentId, validationType, options);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith(
                `/claude-code/deployments/${deploymentId}/validate`,
                {
                    type: validationType,
                    options
                }
            );

            expect(result).toEqual(mockResponse.data);
        });
    });

    describe('createEnvironment', () => {
        it('should create environment successfully', async () => {
            const environmentConfig = {
                name: 'test-env',
                baseImage: 'ubuntu:22.04'
            };
            const mockResponse = {
                data: {
                    id: 'env-123',
                    status: 'created'
                }
            };

            mockAxiosInstance.post.mockResolvedValue(mockResponse);

            const result = await client.createEnvironment(environmentConfig);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/claude-code/environments', environmentConfig);
            expect(result).toEqual(mockResponse.data);
        });
    });

    describe('executeCommand', () => {
        it('should execute command successfully', async () => {
            const environmentId = 'env-123';
            const commandConfig = {
                command: 'npm',
                args: ['install'],
                workingDirectory: '/workspace'
            };
            const mockResponse = {
                data: {
                    exitCode: 0,
                    stdout: 'Installation complete',
                    stderr: ''
                }
            };

            mockAxiosInstance.post.mockResolvedValue(mockResponse);

            const result = await client.executeCommand(environmentId, commandConfig);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith(
                `/claude-code/environments/${environmentId}/execute`,
                commandConfig
            );

            expect(result).toEqual(mockResponse.data);
        });
    });

    describe('fileExists', () => {
        it('should check file existence successfully', async () => {
            const environmentId = 'env-123';
            const filePath = '/workspace/package.json';
            const mockResponse = {
                data: { exists: true }
            };

            mockAxiosInstance.get.mockResolvedValue(mockResponse);

            const result = await client.fileExists(environmentId, filePath);

            expect(mockAxiosInstance.get).toHaveBeenCalledWith(
                `/claude-code/environments/${environmentId}/files`,
                { params: { path: filePath } }
            );

            expect(result).toBe(true);
        });

        it('should return false on error', async () => {
            const environmentId = 'env-123';
            const filePath = '/workspace/package.json';

            mockAxiosInstance.get.mockRejectedValue(new Error('File not found'));

            const result = await client.fileExists(environmentId, filePath);

            expect(result).toBe(false);
        });
    });

    describe('destroyEnvironment', () => {
        it('should destroy environment successfully', async () => {
            const environmentId = 'env-123';
            const mockResponse = {
                data: { status: 'destroyed' }
            };

            mockAxiosInstance.delete.mockResolvedValue(mockResponse);

            const result = await client.destroyEnvironment(environmentId);

            expect(mockAxiosInstance.delete).toHaveBeenCalledWith(`/claude-code/environments/${environmentId}`);
            expect(result).toEqual(mockResponse.data);
        });
    });

    describe('getHealthStatus', () => {
        it('should get health status successfully', async () => {
            const mockResponse = {
                data: {
                    status: 'healthy',
                    version: '1.0.0',
                    uptime: 3600
                }
            };

            mockAxiosInstance.get.mockResolvedValue(mockResponse);

            const result = await client.getHealthStatus();

            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/claude-code/health');
            expect(result).toEqual(mockResponse.data);
        });
    });
});

