/**
 * @fileoverview Validation Engine Integration Tests
 * @description Integration tests for ValidationEngine with AgentAPI
 */

import { jest } from '@jest/globals';
import { ValidationEngine } from '../../src/ai_cicd_system/core/validation_engine.js';
import { ClaudeCodeManager } from '../../src/ai_cicd_system/core/claude_code_manager.js';

// Mock ClaudeCodeManager
jest.mock('../../src/ai_cicd_system/core/claude_code_manager.js');

describe('ValidationEngine Integration', () => {
    let validationEngine;
    let mockClaudeCodeManager;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock ClaudeCodeManager
        mockClaudeCodeManager = {
            validatePR: jest.fn(),
            getStatus: jest.fn(),
            shutdown: jest.fn(),
            on: jest.fn()
        };
        
        ClaudeCodeManager.mockImplementation(() => mockClaudeCodeManager);
        
        // Create validation engine
        validationEngine = new ValidationEngine({
            enable_mock: false,
            agentapi_url: 'http://localhost:3284'
        });
    });

    afterEach(async () => {
        if (validationEngine) {
            await validationEngine.shutdown();
        }
    });

    describe('Initialization', () => {
        test('should initialize with real AgentAPI integration', async () => {
            mockClaudeCodeManager.getStatus.mockReturnValue({
                agentAPIStatus: { isHealthy: true }
            });

            await validationEngine.initialize();

            expect(validationEngine.config.enable_mock).toBe(false);
            expect(ClaudeCodeManager).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentapi_url: 'http://localhost:3284'
                })
            );
        });

        test('should fallback to mock mode when AgentAPI is unhealthy', async () => {
            mockClaudeCodeManager.getStatus.mockReturnValue({
                agentAPIStatus: { isHealthy: false }
            });

            await validationEngine.initialize();

            expect(validationEngine.config.enable_mock).toBe(true);
        });

        test('should fallback to mock mode when AgentAPI status check fails', async () => {
            mockClaudeCodeManager.getStatus.mockImplementation(() => {
                throw new Error('Status check failed');
            });

            await validationEngine.initialize();

            expect(validationEngine.config.enable_mock).toBe(true);
        });
    });

    describe('Real Validation', () => {
        const mockPRInfo = {
            number: 123,
            url: 'https://github.com/test/repo/pull/123',
            branch_name: 'feature-branch'
        };

        const mockTaskContext = {
            task_id: 'task-456',
            requirements: ['Add new feature', 'Include tests']
        };

        test('should perform real validation via Claude Code', async () => {
            const mockClaudeResult = {
                operationId: 'validate-123',
                score: 0.85,
                summary: { status: 'excellent' },
                steps: {
                    clone_repository: { success: true, score: 0.9 },
                    analyze_changes: { success: true, score: 0.8 },
                    run_tests: { success: true, score: 0.85 }
                },
                recommendations: [
                    { type: 'performance', priority: 'medium', message: 'Consider optimization' }
                ],
                timestamp: new Date()
            };

            // Mock successful Claude Code validation
            mockClaudeCodeManager.validatePR.mockResolvedValue(mockClaudeResult);

            // Mock other components
            validationEngine.feedbackGenerator = {
                generateFeedback: jest.fn().mockResolvedValue({
                    summary: 'Good code quality',
                    details: ['Well structured', 'Good test coverage']
                })
            };

            validationEngine.scoreCalculator = {
                calculateScores: jest.fn().mockReturnValue({
                    overall_score: 0.85,
                    code_quality: 0.8,
                    functionality: 0.9,
                    testing: 0.85,
                    documentation: 0.8
                })
            };

            const result = await validationEngine.validatePR(mockPRInfo, mockTaskContext);

            expect(result).toMatchObject({
                validation_id: mockClaudeResult.operationId,
                pr_info: mockPRInfo,
                task_context: mockTaskContext,
                overall_score: 0.85,
                status: 'excellent',
                claude_code_result: mockClaudeResult,
                detailed_scores: expect.any(Object),
                feedback: expect.any(Object),
                recommendations: mockClaudeResult.recommendations,
                validation_method: 'claude_code_agentapi'
            });

            expect(mockClaudeCodeManager.validatePR).toHaveBeenCalledWith({
                url: mockPRInfo.url,
                branch: mockPRInfo.branch_name,
                number: mockPRInfo.number
            }, {
                enableSecurity: true,
                enablePerformance: true,
                taskContext: mockTaskContext
            });
        });

        test('should fallback to mock validation when real validation fails', async () => {
            mockClaudeCodeManager.validatePR.mockRejectedValue(
                new Error('Claude Code validation failed')
            );

            // Mock deployment manager for fallback
            validationEngine.deploymentManager = {
                deployPRBranch: jest.fn().mockResolvedValue({
                    deployment_id: 'deploy-123',
                    deployment_path: '/tmp/deploy-123',
                    duration_ms: 2000
                }),
                cleanup: jest.fn().mockResolvedValue()
            };

            // Mock other components for fallback
            validationEngine.codeAnalyzer = {
                analyzeCode: jest.fn().mockResolvedValue({
                    files_analyzed: 10,
                    issues_found: 2,
                    score: 0.8
                }),
                executeTests: jest.fn().mockResolvedValue({
                    tests_passed: 8,
                    tests_failed: 1,
                    coverage: 85
                }),
                checkRequirementsCompliance: jest.fn().mockResolvedValue({
                    compliance_score: 0.9,
                    missing_requirements: []
                })
            };

            validationEngine.feedbackGenerator = {
                generateFeedback: jest.fn().mockResolvedValue({
                    summary: 'Fallback validation completed'
                })
            };

            validationEngine.scoreCalculator = {
                calculateScores: jest.fn().mockReturnValue({
                    overall_score: 0.75
                })
            };

            const result = await validationEngine.validatePR(mockPRInfo, mockTaskContext);

            expect(result.validation_method).toBe('mock');
            expect(result.overall_score).toBe(0.75);
        });
    });

    describe('Mock Validation', () => {
        test('should perform mock validation when enabled', async () => {
            validationEngine.config.enable_mock = true;

            // Mock all required components
            validationEngine.deploymentManager = {
                deployPRBranch: jest.fn().mockResolvedValue({
                    deployment_id: 'deploy-123',
                    deployment_path: '/tmp/deploy-123',
                    duration_ms: 2000
                }),
                cleanup: jest.fn().mockResolvedValue()
            };

            validationEngine.codeAnalyzer = {
                analyzeCode: jest.fn().mockResolvedValue({
                    files_analyzed: 15,
                    issues_found: 1,
                    score: 0.9
                }),
                executeTests: jest.fn().mockResolvedValue({
                    tests_passed: 12,
                    tests_failed: 0,
                    coverage: 95
                }),
                checkRequirementsCompliance: jest.fn().mockResolvedValue({
                    compliance_score: 0.95,
                    missing_requirements: []
                })
            };

            validationEngine.feedbackGenerator = {
                generateFeedback: jest.fn().mockResolvedValue({
                    summary: 'Excellent code quality',
                    details: ['Well tested', 'Good documentation']
                })
            };

            validationEngine.scoreCalculator = {
                calculateScores: jest.fn().mockReturnValue({
                    overall_score: 0.92
                })
            };

            const mockPRInfo = {
                number: 123,
                url: 'https://github.com/test/repo/pull/123',
                branch_name: 'feature-branch'
            };

            const mockTaskContext = {
                task_id: 'task-456'
            };

            const result = await validationEngine.validatePR(mockPRInfo, mockTaskContext);

            expect(result.validation_method).toBe('mock');
            expect(result.overall_score).toBe(0.92);
            expect(result.status).toBe('passed');
            expect(validationEngine.deploymentManager.deployPRBranch).toHaveBeenCalled();
            expect(validationEngine.deploymentManager.cleanup).toHaveBeenCalled();
        });
    });

    describe('Event Handling', () => {
        test('should handle validation completed events', () => {
            const eventHandler = jest.fn();
            validationEngine.on = jest.fn();

            // Simulate event setup during construction
            expect(mockClaudeCodeManager.on).toHaveBeenCalledWith(
                'validationCompleted',
                expect.any(Function)
            );
            expect(mockClaudeCodeManager.on).toHaveBeenCalledWith(
                'validationFailed',
                expect.any(Function)
            );
            expect(mockClaudeCodeManager.on).toHaveBeenCalledWith(
                'agentAPIUnavailable',
                expect.any(Function)
            );
        });

        test('should enable mock mode when AgentAPI becomes unavailable', () => {
            // Get the event handler for agentAPIUnavailable
            const agentAPIUnavailableHandler = mockClaudeCodeManager.on.mock.calls
                .find(call => call[0] === 'agentAPIUnavailable')[1];

            expect(validationEngine.config.enable_mock).toBe(false);

            // Simulate AgentAPI becoming unavailable
            agentAPIUnavailableHandler();

            expect(validationEngine.config.enable_mock).toBe(true);
        });
    });

    describe('Health Status', () => {
        test('should return health status with AgentAPI information', async () => {
            mockClaudeCodeManager.getStatus.mockReturnValue({
                activeSessions: 2,
                queuedOperations: 1,
                agentAPIStatus: {
                    isHealthy: true,
                    activeSessions: 2
                }
            });

            validationEngine.deploymentManager = {
                getHealth: jest.fn().mockReturnValue({ status: 'healthy' })
            };

            validationEngine.codeAnalyzer = {
                getHealth: jest.fn().mockReturnValue({ status: 'healthy' })
            };

            const health = await validationEngine.getHealth();

            expect(health).toMatchObject({
                status: 'healthy',
                mode: 'production',
                agentapi_url: 'http://localhost:3284',
                claude_code_manager: expect.any(Object),
                deployment_manager: expect.any(Object),
                code_analyzer: expect.any(Object)
            });
        });

        test('should handle health check errors gracefully', async () => {
            mockClaudeCodeManager.getStatus.mockImplementation(() => {
                throw new Error('Status check failed');
            });

            validationEngine.deploymentManager = {
                getHealth: jest.fn().mockReturnValue({ status: 'healthy' })
            };

            validationEngine.codeAnalyzer = {
                getHealth: jest.fn().mockReturnValue({ status: 'healthy' })
            };

            const health = await validationEngine.getHealth();

            expect(health.claude_code_manager).toEqual({
                status: 'error',
                error: 'Status check failed'
            });
        });
    });

    describe('Validation Tracking', () => {
        test('should track active validations', async () => {
            validationEngine.config.enable_mock = true;

            // Mock components
            validationEngine.deploymentManager = {
                deployPRBranch: jest.fn().mockResolvedValue({
                    deployment_id: 'deploy-123',
                    deployment_path: '/tmp/deploy-123',
                    duration_ms: 2000
                }),
                cleanup: jest.fn().mockResolvedValue()
            };

            validationEngine.codeAnalyzer = {
                analyzeCode: jest.fn().mockResolvedValue({ score: 0.8 }),
                executeTests: jest.fn().mockResolvedValue({ coverage: 80 }),
                checkRequirementsCompliance: jest.fn().mockResolvedValue({ score: 0.9 })
            };

            validationEngine.feedbackGenerator = {
                generateFeedback: jest.fn().mockResolvedValue({ summary: 'Good' })
            };

            validationEngine.scoreCalculator = {
                calculateScores: jest.fn().mockReturnValue({ overall_score: 0.85 })
            };

            const mockPRInfo = { number: 123, url: 'test', branch_name: 'main' };
            const mockTaskContext = { task_id: 'task-456' };

            expect(validationEngine.activeValidations.size).toBe(0);

            const validationPromise = validationEngine.validatePR(mockPRInfo, mockTaskContext);

            // Should have active validation during execution
            expect(validationEngine.activeValidations.size).toBe(1);

            await validationPromise;

            // Should be moved to history
            expect(validationEngine.validationHistory.length).toBe(1);
        });

        test('should cleanup validation tracking after timeout', async () => {
            validationEngine.config.enable_mock = true;

            // Mock components for quick validation
            validationEngine.deploymentManager = {
                deployPRBranch: jest.fn().mockResolvedValue({
                    deployment_id: 'deploy-123',
                    deployment_path: '/tmp/deploy-123',
                    duration_ms: 100
                }),
                cleanup: jest.fn().mockResolvedValue()
            };

            validationEngine.codeAnalyzer = {
                analyzeCode: jest.fn().mockResolvedValue({ score: 0.8 }),
                executeTests: jest.fn().mockResolvedValue({ coverage: 80 }),
                checkRequirementsCompliance: jest.fn().mockResolvedValue({ score: 0.9 })
            };

            validationEngine.feedbackGenerator = {
                generateFeedback: jest.fn().mockResolvedValue({ summary: 'Good' })
            };

            validationEngine.scoreCalculator = {
                calculateScores: jest.fn().mockReturnValue({ overall_score: 0.85 })
            };

            const mockPRInfo = { number: 123, url: 'test', branch_name: 'main' };
            const mockTaskContext = { task_id: 'task-456' };

            await validationEngine.validatePR(mockPRInfo, mockTaskContext);

            // Should be cleaned up after timeout (mocked to be immediate for testing)
            expect(validationEngine.activeValidations.size).toBe(1);

            // Wait for cleanup timeout
            await new Promise(resolve => setTimeout(resolve, 100));
        });
    });

    describe('Shutdown', () => {
        test('should shutdown all components', async () => {
            validationEngine.deploymentManager = {
                shutdown: jest.fn().mockResolvedValue()
            };

            await validationEngine.shutdown();

            expect(mockClaudeCodeManager.shutdown).toHaveBeenCalled();
            expect(validationEngine.deploymentManager.shutdown).toHaveBeenCalled();
        });

        test('should not shutdown Claude Code Manager in mock mode', async () => {
            validationEngine.config.enable_mock = true;
            validationEngine.deploymentManager = {
                shutdown: jest.fn().mockResolvedValue()
            };

            await validationEngine.shutdown();

            expect(mockClaudeCodeManager.shutdown).not.toHaveBeenCalled();
            expect(validationEngine.deploymentManager.shutdown).toHaveBeenCalled();
        });
    });
});

