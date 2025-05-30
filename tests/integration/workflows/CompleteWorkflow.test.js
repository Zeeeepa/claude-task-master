/**
 * Complete Workflow Integration Tests
 * 
 * End-to-end integration tests for complete CICD workflows
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TestHelpers } from '../../utils/TestHelpers.js';
import LinearMock from '../../mocks/LinearMock.js';
import GitHubMock from '../../mocks/GitHubMock.js';
import { sampleWorkflow } from '../../fixtures/workflows.js';

// Mock the complete workflow orchestrator
jest.mock('../../../src/ai_cicd_system/orchestration/WorkflowOrchestrator.js', () => ({
  WorkflowOrchestrator: jest.fn().mockImplementation(() => ({
    executeCompleteWorkflow: jest.fn(),
    monitorWorkflowProgress: jest.fn(),
    handleWorkflowFailure: jest.fn(),
    validateWorkflowIntegrity: jest.fn(),
    generateWorkflowReport: jest.fn()
  }))
}));

import { WorkflowOrchestrator } from '../../../src/ai_cicd_system/orchestration/WorkflowOrchestrator.js';

describe('Complete Workflow Integration', () => {
  let workflowOrchestrator;
  let linearMock;
  let githubMock;

  beforeEach(() => {
    workflowOrchestrator = new WorkflowOrchestrator();
    linearMock = new LinearMock();
    githubMock = new GitHubMock();
    
    // Setup mock APIs
    linearMock.mockAPI();
    githubMock.mockAPI();
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    linearMock.reset();
    githubMock.reset();
    await TestHelpers.cleanupTestData();
  });

  describe('End-to-End Workflow Execution', () => {
    test('should execute complete CICD workflow successfully', async () => {
      // Arrange
      const workflowConfig = {
        ...sampleWorkflow,
        integrations: {
          linear: {
            teamId: 'team-1',
            projectId: 'project-1'
          },
          github: {
            repository: 'test-org/test-repo',
            branch: 'feature/auth-system'
          },
          codegen: {
            model: 'claude-3-sonnet',
            temperature: 0.2
          }
        },
        steps: [
          'requirements_analysis',
          'task_decomposition',
          'code_generation',
          'testing',
          'pr_creation',
          'review_process',
          'deployment'
        ]
      };

      const expectedResult = {
        success: true,
        workflowId: workflowConfig.id,
        status: 'completed',
        duration: 3600000, // 1 hour
        steps: {
          requirements_analysis: { status: 'completed', duration: 300000 },
          task_decomposition: { status: 'completed', duration: 600000 },
          code_generation: { status: 'completed', duration: 1800000 },
          testing: { status: 'completed', duration: 900000 },
          pr_creation: { status: 'completed', duration: 120000 },
          review_process: { status: 'completed', duration: 180000 },
          deployment: { status: 'completed', duration: 0 }
        },
        artifacts: {
          linearIssues: ['issue-123', 'issue-124'],
          githubPRs: ['pr-456'],
          generatedFiles: ['src/auth.js', 'tests/auth.test.js'],
          testResults: { passed: 15, failed: 0, coverage: 95 }
        }
      };

      workflowOrchestrator.executeCompleteWorkflow.mockResolvedValue(expectedResult);

      // Act
      const result = await workflowOrchestrator.executeCompleteWorkflow(workflowConfig);

      // Assert
      expect(workflowOrchestrator.executeCompleteWorkflow).toHaveBeenCalledWith(workflowConfig);
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.steps.requirements_analysis.status).toBe('completed');
      expect(result.artifacts.linearIssues).toHaveLength(2);
      expect(result.artifacts.githubPRs).toHaveLength(1);
      expect(result.artifacts.testResults.coverage).toBe(95);
    });

    test('should handle workflow with multiple parallel tasks', async () => {
      // Arrange
      const parallelWorkflow = {
        ...sampleWorkflow,
        parallelExecution: true,
        taskGroups: [
          {
            name: 'frontend_tasks',
            tasks: ['ui_components', 'styling', 'frontend_tests'],
            parallel: true
          },
          {
            name: 'backend_tasks',
            tasks: ['api_endpoints', 'database_schema', 'backend_tests'],
            parallel: true
          },
          {
            name: 'integration_tasks',
            tasks: ['integration_tests', 'e2e_tests'],
            parallel: false,
            dependsOn: ['frontend_tasks', 'backend_tasks']
          }
        ]
      };

      const expectedResult = {
        success: true,
        workflowId: parallelWorkflow.id,
        status: 'completed',
        parallelExecution: true,
        taskGroups: {
          frontend_tasks: {
            status: 'completed',
            duration: 1200000,
            tasks: {
              ui_components: { status: 'completed', duration: 800000 },
              styling: { status: 'completed', duration: 600000 },
              frontend_tests: { status: 'completed', duration: 400000 }
            }
          },
          backend_tasks: {
            status: 'completed',
            duration: 1500000,
            tasks: {
              api_endpoints: { status: 'completed', duration: 900000 },
              database_schema: { status: 'completed', duration: 300000 },
              backend_tests: { status: 'completed', duration: 600000 }
            }
          },
          integration_tasks: {
            status: 'completed',
            duration: 800000,
            tasks: {
              integration_tests: { status: 'completed', duration: 500000 },
              e2e_tests: { status: 'completed', duration: 300000 }
            }
          }
        }
      };

      workflowOrchestrator.executeCompleteWorkflow.mockResolvedValue(expectedResult);

      // Act
      const result = await workflowOrchestrator.executeCompleteWorkflow(parallelWorkflow);

      // Assert
      expect(result.success).toBe(true);
      expect(result.parallelExecution).toBe(true);
      expect(result.taskGroups.frontend_tasks.status).toBe('completed');
      expect(result.taskGroups.backend_tasks.status).toBe('completed');
      expect(result.taskGroups.integration_tasks.status).toBe('completed');
    });

    test('should handle workflow failure and recovery', async () => {
      // Arrange
      const failingWorkflow = {
        ...sampleWorkflow,
        steps: ['requirements_analysis', 'code_generation', 'testing'],
        failureRecovery: {
          enabled: true,
          maxRetries: 3,
          backoffStrategy: 'exponential'
        }
      };

      const failureResult = {
        success: false,
        workflowId: failingWorkflow.id,
        status: 'failed',
        failedStep: 'code_generation',
        error: {
          type: 'GENERATION_ERROR',
          message: 'Code generation failed due to API timeout',
          retryable: true
        },
        recovery: {
          attempted: true,
          retryCount: 2,
          nextRetryAt: new Date(Date.now() + 60000).toISOString()
        }
      };

      workflowOrchestrator.executeCompleteWorkflow.mockResolvedValue(failureResult);
      workflowOrchestrator.handleWorkflowFailure.mockResolvedValue({
        success: true,
        action: 'retry',
        retryScheduled: true
      });

      // Act
      const result = await workflowOrchestrator.executeCompleteWorkflow(failingWorkflow);
      const recoveryResult = await workflowOrchestrator.handleWorkflowFailure(result);

      // Assert
      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('code_generation');
      expect(result.error.retryable).toBe(true);
      expect(recoveryResult.action).toBe('retry');
      expect(recoveryResult.retryScheduled).toBe(true);
    });
  });

  describe('Workflow Monitoring and Progress Tracking', () => {
    test('should monitor workflow progress in real-time', async () => {
      // Arrange
      const workflowId = 'test-workflow-123';
      const progressUpdates = [
        { step: 'requirements_analysis', progress: 100, status: 'completed' },
        { step: 'task_decomposition', progress: 100, status: 'completed' },
        { step: 'code_generation', progress: 60, status: 'active' },
        { step: 'testing', progress: 0, status: 'pending' }
      ];

      workflowOrchestrator.monitorWorkflowProgress.mockResolvedValue({
        workflowId,
        overallProgress: 65,
        currentStep: 'code_generation',
        steps: progressUpdates,
        estimatedCompletion: new Date(Date.now() + 1800000).toISOString(),
        metrics: {
          totalSteps: 4,
          completedSteps: 2,
          activeSteps: 1,
          pendingSteps: 1
        }
      });

      // Act
      const result = await workflowOrchestrator.monitorWorkflowProgress(workflowId);

      // Assert
      expect(result.workflowId).toBe(workflowId);
      expect(result.overallProgress).toBe(65);
      expect(result.currentStep).toBe('code_generation');
      expect(result.steps).toHaveLength(4);
      expect(result.metrics.completedSteps).toBe(2);
    });

    test('should provide detailed step-by-step progress', async () => {
      // Arrange
      const workflowId = 'test-workflow-456';
      const detailedProgress = {
        workflowId,
        steps: {
          requirements_analysis: {
            status: 'completed',
            progress: 100,
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T10:05:00Z',
            duration: 300000,
            artifacts: ['requirements.md', 'user_stories.json']
          },
          task_decomposition: {
            status: 'completed',
            progress: 100,
            startTime: '2024-01-01T10:05:00Z',
            endTime: '2024-01-01T10:15:00Z',
            duration: 600000,
            artifacts: ['task_breakdown.json', 'dependency_graph.json']
          },
          code_generation: {
            status: 'active',
            progress: 75,
            startTime: '2024-01-01T10:15:00Z',
            endTime: null,
            estimatedDuration: 1800000,
            currentSubtask: 'generating_auth_middleware',
            artifacts: ['src/auth.js', 'src/middleware/auth.js']
          }
        }
      };

      workflowOrchestrator.monitorWorkflowProgress.mockResolvedValue(detailedProgress);

      // Act
      const result = await workflowOrchestrator.monitorWorkflowProgress(workflowId);

      // Assert
      expect(result.steps.requirements_analysis.status).toBe('completed');
      expect(result.steps.code_generation.status).toBe('active');
      expect(result.steps.code_generation.progress).toBe(75);
      expect(result.steps.code_generation.currentSubtask).toBe('generating_auth_middleware');
    });

    test('should track resource utilization during workflow execution', async () => {
      // Arrange
      const workflowId = 'test-workflow-789';
      const resourceMetrics = {
        workflowId,
        resourceUtilization: {
          cpu: {
            current: 65,
            average: 58,
            peak: 85,
            unit: 'percentage'
          },
          memory: {
            current: 2048,
            average: 1856,
            peak: 3072,
            unit: 'MB'
          },
          network: {
            inbound: 125,
            outbound: 89,
            unit: 'MB/s'
          },
          storage: {
            read: 45,
            write: 23,
            unit: 'MB/s'
          }
        },
        performance: {
          throughput: 12.5,
          latency: 250,
          errorRate: 0.02
        }
      };

      workflowOrchestrator.monitorWorkflowProgress.mockResolvedValue(resourceMetrics);

      // Act
      const result = await workflowOrchestrator.monitorWorkflowProgress(workflowId);

      // Assert
      expect(result.resourceUtilization.cpu.current).toBe(65);
      expect(result.resourceUtilization.memory.peak).toBe(3072);
      expect(result.performance.throughput).toBe(12.5);
      expect(result.performance.errorRate).toBe(0.02);
    });
  });

  describe('Integration Points Validation', () => {
    test('should validate all integration points before workflow execution', async () => {
      // Arrange
      const workflowConfig = {
        ...sampleWorkflow,
        integrations: {
          linear: { apiKey: 'linear-key', teamId: 'team-1' },
          github: { token: 'github-token', repository: 'test/repo' },
          codegen: { apiKey: 'codegen-key', model: 'claude-3' },
          claudeCode: { apiKey: 'claude-code-key' }
        }
      };

      const validationResult = {
        valid: true,
        integrations: {
          linear: { status: 'connected', latency: 120 },
          github: { status: 'connected', latency: 95 },
          codegen: { status: 'connected', latency: 200 },
          claudeCode: { status: 'connected', latency: 150 }
        },
        overallHealth: 'healthy',
        recommendations: []
      };

      workflowOrchestrator.validateWorkflowIntegrity.mockResolvedValue(validationResult);

      // Act
      const result = await workflowOrchestrator.validateWorkflowIntegrity(workflowConfig);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.overallHealth).toBe('healthy');
      expect(result.integrations.linear.status).toBe('connected');
      expect(result.integrations.github.status).toBe('connected');
      expect(result.recommendations).toHaveLength(0);
    });

    test('should handle integration failures gracefully', async () => {
      // Arrange
      const workflowConfig = {
        ...sampleWorkflow,
        integrations: {
          linear: { apiKey: 'invalid-key', teamId: 'team-1' },
          github: { token: 'github-token', repository: 'test/repo' }
        }
      };

      const validationResult = {
        valid: false,
        integrations: {
          linear: { 
            status: 'failed', 
            error: 'Authentication failed',
            latency: null 
          },
          github: { 
            status: 'connected', 
            latency: 95 
          }
        },
        overallHealth: 'degraded',
        recommendations: [
          'Check Linear API key configuration',
          'Verify Linear team permissions'
        ]
      };

      workflowOrchestrator.validateWorkflowIntegrity.mockResolvedValue(validationResult);

      // Act
      const result = await workflowOrchestrator.validateWorkflowIntegrity(workflowConfig);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.overallHealth).toBe('degraded');
      expect(result.integrations.linear.status).toBe('failed');
      expect(result.recommendations).toHaveLength(2);
    });
  });

  describe('Workflow Reporting and Analytics', () => {
    test('should generate comprehensive workflow report', async () => {
      // Arrange
      const workflowId = 'test-workflow-completed';
      const reportData = {
        workflowId,
        summary: {
          status: 'completed',
          duration: 3600000,
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T11:00:00Z',
          efficiency: 0.87
        },
        steps: {
          total: 7,
          completed: 7,
          failed: 0,
          skipped: 0
        },
        performance: {
          averageStepDuration: 514285,
          longestStep: { name: 'code_generation', duration: 1800000 },
          shortestStep: { name: 'pr_creation', duration: 120000 }
        },
        quality: {
          codeQuality: 0.92,
          testCoverage: 0.95,
          securityScore: 0.88
        },
        artifacts: {
          filesGenerated: 15,
          testsCreated: 23,
          issuesCreated: 3,
          prsCreated: 1
        },
        integrations: {
          linear: { callsCount: 12, successRate: 1.0 },
          github: { callsCount: 8, successRate: 1.0 },
          codegen: { callsCount: 25, successRate: 0.96 }
        }
      };

      workflowOrchestrator.generateWorkflowReport.mockResolvedValue(reportData);

      // Act
      const result = await workflowOrchestrator.generateWorkflowReport(workflowId);

      // Assert
      expect(result.workflowId).toBe(workflowId);
      expect(result.summary.status).toBe('completed');
      expect(result.summary.efficiency).toBe(0.87);
      expect(result.steps.completed).toBe(7);
      expect(result.quality.testCoverage).toBe(0.95);
      expect(result.artifacts.filesGenerated).toBe(15);
    });

    test('should provide workflow analytics and insights', async () => {
      // Arrange
      const workflowId = 'test-workflow-analytics';
      const analyticsData = {
        workflowId,
        insights: {
          bottlenecks: [
            {
              step: 'code_generation',
              reason: 'Complex requirements processing',
              impact: 'high',
              suggestion: 'Consider breaking down into smaller tasks'
            }
          ],
          optimizations: [
            {
              area: 'parallel_execution',
              potential: 'medium',
              estimatedImprovement: '25% faster execution'
            }
          ],
          trends: {
            executionTime: { trend: 'improving', change: -15 },
            successRate: { trend: 'stable', change: 0 },
            resourceUsage: { trend: 'optimizing', change: -8 }
          }
        },
        comparisons: {
          previousRuns: {
            averageDuration: 4200000,
            currentDuration: 3600000,
            improvement: 14.3
          },
          similarWorkflows: {
            averageDuration: 3900000,
            currentDuration: 3600000,
            performance: 'above_average'
          }
        }
      };

      workflowOrchestrator.generateWorkflowReport.mockResolvedValue(analyticsData);

      // Act
      const result = await workflowOrchestrator.generateWorkflowReport(workflowId);

      // Assert
      expect(result.insights.bottlenecks).toHaveLength(1);
      expect(result.insights.optimizations).toHaveLength(1);
      expect(result.comparisons.previousRuns.improvement).toBe(14.3);
      expect(result.comparisons.similarWorkflows.performance).toBe('above_average');
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should implement automatic error recovery', async () => {
      // Arrange
      const workflowWithRecovery = {
        ...sampleWorkflow,
        errorRecovery: {
          enabled: true,
          strategies: ['retry', 'fallback', 'skip'],
          maxRetries: 3,
          retryDelay: 30000
        }
      };

      const recoveryResult = {
        success: true,
        workflowId: workflowWithRecovery.id,
        recoveryActions: [
          {
            step: 'code_generation',
            error: 'API timeout',
            action: 'retry',
            attempt: 2,
            success: true
          },
          {
            step: 'testing',
            error: 'Test environment unavailable',
            action: 'fallback',
            fallbackMethod: 'local_testing',
            success: true
          }
        ],
        finalStatus: 'completed'
      };

      workflowOrchestrator.executeCompleteWorkflow.mockResolvedValue(recoveryResult);

      // Act
      const result = await workflowOrchestrator.executeCompleteWorkflow(workflowWithRecovery);

      // Assert
      expect(result.success).toBe(true);
      expect(result.recoveryActions).toHaveLength(2);
      expect(result.recoveryActions[0].action).toBe('retry');
      expect(result.recoveryActions[1].action).toBe('fallback');
      expect(result.finalStatus).toBe('completed');
    });

    test('should handle cascading failures', async () => {
      // Arrange
      const cascadingFailureWorkflow = {
        ...sampleWorkflow,
        steps: ['step1', 'step2', 'step3', 'step4'],
        dependencies: {
          step2: ['step1'],
          step3: ['step2'],
          step4: ['step3']
        }
      };

      const cascadingResult = {
        success: false,
        workflowId: cascadingFailureWorkflow.id,
        status: 'failed',
        cascadingFailure: true,
        failureChain: [
          { step: 'step1', status: 'failed', error: 'Initial failure' },
          { step: 'step2', status: 'cancelled', reason: 'Dependency failed' },
          { step: 'step3', status: 'cancelled', reason: 'Dependency failed' },
          { step: 'step4', status: 'cancelled', reason: 'Dependency failed' }
        ],
        impactAnalysis: {
          stepsAffected: 4,
          estimatedRecoveryTime: 1800000
        }
      };

      workflowOrchestrator.executeCompleteWorkflow.mockResolvedValue(cascadingResult);

      // Act
      const result = await workflowOrchestrator.executeCompleteWorkflow(cascadingFailureWorkflow);

      // Assert
      expect(result.success).toBe(false);
      expect(result.cascadingFailure).toBe(true);
      expect(result.failureChain).toHaveLength(4);
      expect(result.impactAnalysis.stepsAffected).toBe(4);
    });
  });
});

