/**
 * Integration Tests for Claude Code WSL2 Integration
 * 
 * Comprehensive tests for the WSL2-based deployment pipeline
 */

import { jest } from '@jest/globals';
import ClaudeCodeWSL2Integration from '../index.js';
import WSL2Manager from '../wsl2_manager.js';
import DeploymentPipeline from '../deployment_pipeline.js';
import ValidationEngine from '../validation_engine.js';
import TestExecutor from '../test_executor.js';
import ErrorResolver from '../error_resolver.js';

// Mock external dependencies
jest.mock('child_process');
jest.mock('fs/promises');

describe('Claude Code WSL2 Integration', () => {
    let integration;
    let mockPRInfo;

    beforeEach(() => {
        integration = new ClaudeCodeWSL2Integration({
            maxConcurrentValidations: 2,
            validationTimeout: 10000, // 10 seconds for tests
            autoErrorResolution: true,
            wsl2: {
                maxInstances: 5,
                defaultCpuCores: 2,
                defaultMemoryGB: 4
            },
            deployment: {
                workspaceRoot: '/tmp/test-deployments',
                gitTimeout: 5000,
                buildTimeout: 5000
            },
            validation: {
                validationTimeout: 5000,
                supportedLanguages: ['javascript', 'python']
            },
            testing: {
                testTimeout: 5000,
                coverageThreshold: 70
            },
            errorResolution: {
                maxResolutionAttempts: 2,
                autoFixEnabled: true
            }
        });

        mockPRInfo = {
            repositoryUrl: 'https://github.com/test/repo.git',
            branchName: 'feature/test-branch',
            prNumber: 123,
            title: 'Test PR'
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize all components successfully', async () => {
            // Mock successful initialization for all components
            jest.spyOn(integration.wsl2Manager, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.deploymentPipeline, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.validationEngine, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.testExecutor, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.errorResolver, 'initialize').mockResolvedValue(true);

            const result = await integration.initialize();

            expect(result).toBe(true);
            expect(integration.isInitialized).toBe(true);
            expect(integration.wsl2Manager.initialize).toHaveBeenCalled();
            expect(integration.deploymentPipeline.initialize).toHaveBeenCalled();
            expect(integration.validationEngine.initialize).toHaveBeenCalled();
            expect(integration.testExecutor.initialize).toHaveBeenCalled();
            expect(integration.errorResolver.initialize).toHaveBeenCalled();
        });

        test('should fail initialization if any component fails', async () => {
            // Mock one component failing
            jest.spyOn(integration.wsl2Manager, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.deploymentPipeline, 'initialize').mockResolvedValue(false);
            jest.spyOn(integration.validationEngine, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.testExecutor, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.errorResolver, 'initialize').mockResolvedValue(true);

            const result = await integration.initialize();

            expect(result).toBe(false);
            expect(integration.isInitialized).toBe(false);
        });
    });

    describe('PR Validation', () => {
        beforeEach(async () => {
            // Mock successful initialization
            jest.spyOn(integration.wsl2Manager, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.deploymentPipeline, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.validationEngine, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.testExecutor, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.errorResolver, 'initialize').mockResolvedValue(true);

            await integration.initialize();
        });

        test('should successfully validate a PR branch', async () => {
            // Mock successful deployment
            const mockDeploymentResult = {
                success: true,
                deploymentId: 'deploy-123',
                deploymentPath: '/tmp/test-deployments/deploy-123',
                deploymentTime: 5000,
                environment: { containerId: 'container-123' }
            };

            // Mock successful validation
            const mockValidationResult = {
                success: true,
                validationId: 'validation-123',
                validationTime: 3000,
                results: {
                    syntax: { success: true, errors: [], warnings: [] },
                    quality: { success: true, overallScore: 8.5 },
                    security: { success: true, riskLevel: 'low' },
                    performance: { success: true, metrics: {} }
                }
            };

            // Mock successful test execution
            const mockTestResult = {
                success: true,
                testRunId: 'test-123',
                executionTime: 4000,
                summary: {
                    totalTests: 50,
                    passedTests: 50,
                    failedTests: 0,
                    coverage: 85
                }
            };

            jest.spyOn(integration.deploymentPipeline, 'deployPRBranch').mockResolvedValue(mockDeploymentResult);
            jest.spyOn(integration.validationEngine, 'validateCode').mockResolvedValue(mockValidationResult);
            jest.spyOn(integration.testExecutor, 'executeTests').mockResolvedValue(mockTestResult);
            jest.spyOn(integration.deploymentPipeline, 'cleanupDeployment').mockResolvedValue({ success: true });

            const result = await integration.validatePRBranch(mockPRInfo);

            expect(result.success).toBe(true);
            expect(result.validationId).toBeDefined();
            expect(result.results.deployment).toEqual(mockDeploymentResult);
            expect(result.results.validation).toEqual(mockValidationResult);
            expect(result.results.testing).toEqual(mockTestResult);
            expect(result.feedback).toBeDefined();
            expect(result.metrics).toBeDefined();
        });

        test('should handle deployment failure', async () => {
            const mockDeploymentResult = {
                success: false,
                error: 'Failed to clone repository',
                deploymentId: 'deploy-123',
                deploymentTime: 1000
            };

            jest.spyOn(integration.deploymentPipeline, 'deployPRBranch').mockResolvedValue(mockDeploymentResult);

            const result = await integration.validatePRBranch(mockPRInfo);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Deployment failed');
        });

        test('should trigger error resolution when validation fails', async () => {
            const mockDeploymentResult = {
                success: true,
                deploymentId: 'deploy-123',
                deploymentPath: '/tmp/test-deployments/deploy-123',
                deploymentTime: 5000
            };

            const mockValidationResult = {
                success: false,
                validationId: 'validation-123',
                validationTime: 3000,
                results: {
                    syntax: { success: false, errors: [{ message: 'Syntax error' }] }
                }
            };

            const mockTestResult = {
                success: true,
                testRunId: 'test-123',
                executionTime: 4000,
                summary: { totalTests: 50, passedTests: 50, failedTests: 0 }
            };

            const mockErrorResolutionResult = {
                success: true,
                resolutionId: 'resolution-123',
                resolutionTime: 2000,
                resolutionResults: { stepsSuccessful: 1 }
            };

            jest.spyOn(integration.deploymentPipeline, 'deployPRBranch').mockResolvedValue(mockDeploymentResult);
            jest.spyOn(integration.validationEngine, 'validateCode').mockResolvedValue(mockValidationResult);
            jest.spyOn(integration.testExecutor, 'executeTests').mockResolvedValue(mockTestResult);
            jest.spyOn(integration.errorResolver, 'resolveErrors').mockResolvedValue(mockErrorResolutionResult);
            jest.spyOn(integration.deploymentPipeline, 'cleanupDeployment').mockResolvedValue({ success: true });

            const result = await integration.validatePRBranch(mockPRInfo);

            expect(integration.errorResolver.resolveErrors).toHaveBeenCalled();
            expect(result.results.errorResolution).toEqual(mockErrorResolutionResult);
        });
    });

    describe('Quick Validation', () => {
        beforeEach(async () => {
            // Mock successful initialization
            jest.spyOn(integration.wsl2Manager, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.deploymentPipeline, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.validationEngine, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.testExecutor, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.errorResolver, 'initialize').mockResolvedValue(true);

            await integration.initialize();
        });

        test('should perform quick validation successfully', async () => {
            const mockDeploymentResult = {
                success: true,
                deploymentId: 'deploy-quick-123',
                deploymentPath: '/tmp/test-deployments/deploy-quick-123',
                deploymentTime: 2000
            };

            const mockValidationResult = {
                success: true,
                validationId: 'validation-quick-123',
                validationTime: 1000,
                fileResults: [
                    { file: 'test.js', success: true, errors: [] }
                ]
            };

            jest.spyOn(integration.deploymentPipeline, 'deployPRBranch').mockResolvedValue(mockDeploymentResult);
            jest.spyOn(integration.validationEngine, 'validateFiles').mockResolvedValue(mockValidationResult);
            jest.spyOn(integration.deploymentPipeline, 'cleanupDeployment').mockResolvedValue({ success: true });

            const result = await integration.quickValidate(mockPRInfo);

            expect(result.success).toBe(true);
            expect(result.validationId).toBeDefined();
            expect(result.results.deployment).toEqual(mockDeploymentResult);
            expect(result.results.validation).toEqual(mockValidationResult);
            expect(result.recommendation).toBeDefined();
        });
    });

    describe('Status and Monitoring', () => {
        test('should return validation status', () => {
            const validationId = 'test-validation-123';
            
            // Manually add a validation to the active validations
            integration.activeValidations.set(validationId, {
                validationId,
                prInfo: mockPRInfo,
                status: 'running',
                startedAt: new Date().toISOString(),
                progress: 50,
                currentStep: 'validation',
                estimatedTimeRemaining: 5000
            });

            const status = integration.getValidationStatus(validationId);

            expect(status.status).toBe('running');
            expect(status.validationId).toBe(validationId);
            expect(status.progress).toBe(50);
            expect(status.currentStep).toBe('validation');
        });

        test('should return not found for non-existent validation', () => {
            const status = integration.getValidationStatus('non-existent-id');
            expect(status.status).toBe('not_found');
        });

        test('should list active validations', () => {
            const validationId1 = 'test-validation-1';
            const validationId2 = 'test-validation-2';

            integration.activeValidations.set(validationId1, {
                validationId: validationId1,
                prInfo: mockPRInfo,
                status: 'running',
                startedAt: new Date().toISOString(),
                progress: 30
            });

            integration.activeValidations.set(validationId2, {
                validationId: validationId2,
                prInfo: { ...mockPRInfo, prNumber: 124 },
                status: 'running',
                startedAt: new Date().toISOString(),
                progress: 70
            });

            const activeValidations = integration.listActiveValidations();

            expect(activeValidations).toHaveLength(2);
            expect(activeValidations[0].validationId).toBe(validationId1);
            expect(activeValidations[1].validationId).toBe(validationId2);
        });

        test('should return comprehensive system status', () => {
            // Mock component statuses
            jest.spyOn(integration.wsl2Manager, 'getStatus').mockReturnValue({
                isInitialized: true,
                activeInstances: 2,
                metrics: {}
            });

            jest.spyOn(integration.deploymentPipeline, 'getStatus').mockReturnValue({
                isInitialized: true,
                activeDeployments: 1,
                metrics: {}
            });

            jest.spyOn(integration.validationEngine, 'getStatus').mockReturnValue({
                isInitialized: true,
                activeValidations: 1,
                metrics: {}
            });

            jest.spyOn(integration.testExecutor, 'getStatus').mockReturnValue({
                isInitialized: true,
                activeTestRuns: 1,
                metrics: {}
            });

            jest.spyOn(integration.errorResolver, 'getStatus').mockReturnValue({
                isInitialized: true,
                activeResolutions: 0,
                metrics: {}
            });

            const status = integration.getStatus();

            expect(status.isInitialized).toBe(false); // Not initialized in this test
            expect(status.activeValidations).toBe(0);
            expect(status.components).toBeDefined();
            expect(status.components.wsl2Manager).toBeDefined();
            expect(status.components.deploymentPipeline).toBeDefined();
            expect(status.components.validationEngine).toBeDefined();
            expect(status.components.testExecutor).toBeDefined();
            expect(status.components.errorResolver).toBeDefined();
            expect(status.metrics).toBeDefined();
            expect(status.config).toBeDefined();
        });
    });

    describe('Metrics and Performance', () => {
        test('should update metrics correctly on successful validation', () => {
            const mockResult = {
                success: true,
                results: {
                    errorResolution: {
                        resolutionResults: {
                            stepsSuccessful: 2
                        }
                    }
                },
                metrics: {
                    deploymentTime: 5000,
                    validationTime: 3000,
                    testTime: 4000,
                    totalTime: 12000
                }
            };

            const initialCompleted = integration.metrics.validationsCompleted;
            const initialErrorsResolved = integration.metrics.errorsResolved;

            integration.updateMetrics(mockResult, 12000);

            expect(integration.metrics.validationsCompleted).toBe(initialCompleted + 1);
            expect(integration.metrics.errorsResolved).toBe(initialErrorsResolved + 2);
            expect(integration.metrics.averageValidationTime).toBeGreaterThan(0);
        });

        test('should update metrics correctly on failed validation', () => {
            const mockResult = {
                success: false
            };

            const initialFailed = integration.metrics.validationsFailed;

            integration.updateMetrics(mockResult, 5000);

            expect(integration.metrics.validationsFailed).toBe(initialFailed + 1);
        });

        test('should calculate success rate correctly', () => {
            // Simulate some successful and failed validations
            integration.metrics.validationsCompleted = 8;
            integration.metrics.validationsFailed = 2;

            integration.updateMetrics({ success: true }, 1000);

            expect(integration.metrics.successRate).toBe(0.9); // 9/10 = 0.9
        });
    });

    describe('Error Handling', () => {
        test('should handle initialization failure gracefully', async () => {
            jest.spyOn(integration.wsl2Manager, 'initialize').mockRejectedValue(new Error('WSL2 initialization failed'));

            const result = await integration.initialize();

            expect(result).toBe(false);
            expect(integration.isInitialized).toBe(false);
        });

        test('should handle validation without initialization', async () => {
            const result = await integration.validatePRBranch(mockPRInfo);

            expect(result.success).toBe(false);
            expect(result.error).toContain('not initialized');
        });

        test('should handle unexpected errors during validation', async () => {
            // Mock successful initialization
            jest.spyOn(integration.wsl2Manager, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.deploymentPipeline, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.validationEngine, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.testExecutor, 'initialize').mockResolvedValue(true);
            jest.spyOn(integration.errorResolver, 'initialize').mockResolvedValue(true);

            await integration.initialize();

            // Mock deployment throwing an error
            jest.spyOn(integration.deploymentPipeline, 'deployPRBranch').mockRejectedValue(new Error('Unexpected deployment error'));

            const result = await integration.validatePRBranch(mockPRInfo);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unexpected deployment error');
        });
    });

    describe('Shutdown', () => {
        test('should shutdown all components successfully', async () => {
            jest.spyOn(integration.wsl2Manager, 'shutdown').mockResolvedValue();
            jest.spyOn(integration.deploymentPipeline, 'shutdown').mockResolvedValue();
            jest.spyOn(integration.validationEngine, 'shutdown').mockResolvedValue();
            jest.spyOn(integration.testExecutor, 'shutdown').mockResolvedValue();
            jest.spyOn(integration.errorResolver, 'shutdown').mockResolvedValue();

            await integration.shutdown();

            expect(integration.wsl2Manager.shutdown).toHaveBeenCalled();
            expect(integration.deploymentPipeline.shutdown).toHaveBeenCalled();
            expect(integration.validationEngine.shutdown).toHaveBeenCalled();
            expect(integration.testExecutor.shutdown).toHaveBeenCalled();
            expect(integration.errorResolver.shutdown).toHaveBeenCalled();
            expect(integration.isInitialized).toBe(false);
            expect(integration.activeValidations.size).toBe(0);
        });
    });
});

describe('Component Integration Tests', () => {
    describe('WSL2Manager', () => {
        let wsl2Manager;

        beforeEach(() => {
            wsl2Manager = new WSL2Manager({
                maxInstances: 3,
                defaultCpuCores: 2,
                defaultMemoryGB: 4
            });
        });

        test('should initialize with correct configuration', () => {
            expect(wsl2Manager.config.maxInstances).toBe(3);
            expect(wsl2Manager.config.defaultCpuCores).toBe(2);
            expect(wsl2Manager.config.defaultMemoryGB).toBe(4);
            expect(wsl2Manager.isInitialized).toBe(false);
        });

        test('should track metrics correctly', () => {
            expect(wsl2Manager.metrics.instancesCreated).toBe(0);
            expect(wsl2Manager.metrics.instancesDestroyed).toBe(0);
            expect(wsl2Manager.metrics.averageProvisionTime).toBe(0);
        });
    });

    describe('DeploymentPipeline', () => {
        let deploymentPipeline;

        beforeEach(() => {
            deploymentPipeline = new DeploymentPipeline({
                workspaceRoot: '/tmp/test-deployments',
                maxConcurrentDeployments: 2
            });
        });

        test('should initialize with correct configuration', () => {
            expect(deploymentPipeline.config.workspaceRoot).toBe('/tmp/test-deployments');
            expect(deploymentPipeline.config.maxConcurrentDeployments).toBe(2);
            expect(deploymentPipeline.isInitialized).toBe(false);
        });
    });

    describe('ValidationEngine', () => {
        let validationEngine;

        beforeEach(() => {
            validationEngine = new ValidationEngine({
                supportedLanguages: ['javascript', 'python'],
                qualityThresholds: {
                    minScore: 7.0,
                    maxComplexity: 10
                }
            });
        });

        test('should initialize with correct configuration', () => {
            expect(validationEngine.config.supportedLanguages).toContain('javascript');
            expect(validationEngine.config.supportedLanguages).toContain('python');
            expect(validationEngine.config.qualityThresholds.minScore).toBe(7.0);
            expect(validationEngine.isInitialized).toBe(false);
        });
    });

    describe('TestExecutor', () => {
        let testExecutor;

        beforeEach(() => {
            testExecutor = new TestExecutor({
                testTimeout: 10000,
                coverageThreshold: 80,
                testFrameworks: ['jest', 'pytest']
            });
        });

        test('should initialize with correct configuration', () => {
            expect(testExecutor.config.testTimeout).toBe(10000);
            expect(testExecutor.config.coverageThreshold).toBe(80);
            expect(testExecutor.config.testFrameworks).toContain('jest');
            expect(testExecutor.config.testFrameworks).toContain('pytest');
            expect(testExecutor.isInitialized).toBe(false);
        });
    });

    describe('ErrorResolver', () => {
        let errorResolver;

        beforeEach(() => {
            errorResolver = new ErrorResolver({
                maxResolutionAttempts: 3,
                autoFixEnabled: true,
                confidenceThreshold: 0.7
            });
        });

        test('should initialize with correct configuration', () => {
            expect(errorResolver.config.maxResolutionAttempts).toBe(3);
            expect(errorResolver.config.autoFixEnabled).toBe(true);
            expect(errorResolver.config.confidenceThreshold).toBe(0.7);
            expect(errorResolver.isInitialized).toBe(false);
        });
    });
});

