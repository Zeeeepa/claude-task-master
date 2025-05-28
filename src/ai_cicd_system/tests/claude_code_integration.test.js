/**
 * Claude Code Integration Tests
 * Tests for the Claude Code integration functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ClaudeCodeIntegrator } from '../integrations/claude_code_integrator.js';
import { ClaudeCodeClient } from '../utils/claude_code_client.js';

// Mock the logger
jest.mock('../utils/simple_logger.js', () => ({
  log: jest.fn()
}));

describe('Claude Code Integration', () => {
  let integrator;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      claudeCodePath: 'claude-code',
      wsl2Enabled: false, // Disable WSL2 for testing
      validationTimeout: 30000,
      maxConcurrentValidations: 2,
      enableDebugging: true,
      enableCodeAnalysis: true
    };

    integrator = new ClaudeCodeIntegrator(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid config', async () => {
      // Mock Claude Code CLI availability
      jest.spyOn(integrator.claudeCodeClient, 'checkAvailability')
        .mockResolvedValue(true);
      
      jest.spyOn(integrator.prValidator, 'initialize')
        .mockResolvedValue();
      
      jest.spyOn(integrator.codeAnalyzer, 'initialize')
        .mockResolvedValue();

      await integrator.initialize();

      expect(integrator.isInitialized).toBe(true);
    });

    test('should fail initialization if Claude Code CLI is not available', async () => {
      jest.spyOn(integrator.claudeCodeClient, 'checkAvailability')
        .mockRejectedValue(new Error('Claude Code CLI not found'));

      await expect(integrator.initialize()).rejects.toThrow('Claude Code CLI not found');
      expect(integrator.isInitialized).toBe(false);
    });

    test('should fail initialization if components fail to initialize', async () => {
      jest.spyOn(integrator.claudeCodeClient, 'checkAvailability')
        .mockResolvedValue(true);
      
      jest.spyOn(integrator.prValidator, 'initialize')
        .mockRejectedValue(new Error('PR Validator initialization failed'));

      await expect(integrator.initialize()).rejects.toThrow('PR Validator initialization failed');
      expect(integrator.isInitialized).toBe(false);
    });
  });

  describe('PR Validation', () => {
    const mockPRDetails = {
      prNumber: 123,
      repository: 'https://github.com/test/repo.git',
      headBranch: 'feature/test',
      title: 'Test PR',
      description: 'Test PR description',
      author: 'testuser',
      modifiedFiles: ['src/test.js', 'src/utils.js']
    };

    beforeEach(async () => {
      // Mock initialization
      jest.spyOn(integrator.claudeCodeClient, 'checkAvailability')
        .mockResolvedValue(true);
      jest.spyOn(integrator.prValidator, 'initialize').mockResolvedValue();
      jest.spyOn(integrator.codeAnalyzer, 'initialize').mockResolvedValue();
      
      await integrator.initialize();
    });

    test('should validate PR successfully', async () => {
      const mockValidationResult = {
        success: true,
        issues: [],
        suggestions: [{ type: 'improvement', message: 'Consider adding tests' }],
        metrics: { complexity: 5, coverage: 80 },
        summary: { filesAnalyzed: 2, issuesFound: 0 }
      };

      const mockAnalysisResult = {
        summary: { overallScore: 85, criticalIssues: 0 },
        metrics: { complexity: { averageComplexity: 5 } },
        recommendations: []
      };

      // Mock environment creation
      jest.spyOn(integrator, 'createValidationEnvironment')
        .mockResolvedValue({
          id: 'test-env',
          name: 'test-environment',
          type: 'local',
          workingDirectory: '/tmp/test'
        });

      // Mock setup PR branch
      jest.spyOn(integrator, 'setupPRBranch').mockResolvedValue();

      // Mock Claude Code validation
      jest.spyOn(integrator.claudeCodeClient, 'validateCode')
        .mockResolvedValue(mockValidationResult);

      // Mock code analysis
      jest.spyOn(integrator.codeAnalyzer, 'analyzeCode')
        .mockResolvedValue(mockAnalysisResult);

      // Mock report generation
      jest.spyOn(integrator.validationReporter, 'generateReport')
        .mockResolvedValue({
          summary: { status: 'passed', overallScore: 85 },
          validation: mockValidationResult,
          analysis: mockAnalysisResult
        });

      // Mock cleanup
      jest.spyOn(integrator, 'cleanupEnvironment').mockResolvedValue();

      const result = await integrator.validatePR(mockPRDetails);

      expect(result).toBeDefined();
      expect(result.summary.status).toBe('passed');
      expect(integrator.claudeCodeClient.validateCode).toHaveBeenCalledWith({
        environment: expect.any(Object),
        files: mockPRDetails.modifiedFiles,
        context: {
          prTitle: mockPRDetails.title,
          prDescription: mockPRDetails.description,
          author: mockPRDetails.author
        }
      });
    });

    test('should handle validation errors gracefully', async () => {
      jest.spyOn(integrator, 'createValidationEnvironment')
        .mockRejectedValue(new Error('Environment creation failed'));

      await expect(integrator.validatePR(mockPRDetails)).rejects.toThrow('Environment creation failed');
    });

    test('should respect concurrent validation limits', async () => {
      // Set up mocks that will hang to simulate long-running validations
      jest.spyOn(integrator, 'createValidationEnvironment')
        .mockImplementation(() => new Promise(() => {})); // Never resolves

      // Start maximum number of concurrent validations
      const validationPromises = [];
      for (let i = 0; i < mockConfig.maxConcurrentValidations; i++) {
        validationPromises.push(integrator.validatePR({
          ...mockPRDetails,
          prNumber: 100 + i
        }));
      }

      // Try to start one more validation - should fail immediately
      await expect(integrator.validatePR({
        ...mockPRDetails,
        prNumber: 999
      })).rejects.toThrow('Maximum concurrent validations reached');
    });

    test('should track validation history', async () => {
      const mockResult = {
        summary: { status: 'passed' },
        validation: { success: true },
        analysis: { summary: { overallScore: 90 } }
      };

      // Mock all dependencies
      jest.spyOn(integrator, 'createValidationEnvironment').mockResolvedValue({ id: 'test' });
      jest.spyOn(integrator, 'setupPRBranch').mockResolvedValue();
      jest.spyOn(integrator.claudeCodeClient, 'validateCode').mockResolvedValue({ success: true });
      jest.spyOn(integrator.codeAnalyzer, 'analyzeCode').mockResolvedValue({ summary: { overallScore: 90 } });
      jest.spyOn(integrator.validationReporter, 'generateReport').mockResolvedValue(mockResult);
      jest.spyOn(integrator, 'cleanupEnvironment').mockResolvedValue();

      await integrator.validatePR(mockPRDetails);

      const history = integrator.getValidationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].prNumber).toBe(mockPRDetails.prNumber);
      expect(history[0].status).toBe('completed');
    });
  });

  describe('Debugging Capabilities', () => {
    const mockEnvironment = {
      id: 'test-env',
      name: 'test-environment',
      type: 'local',
      workingDirectory: '/tmp/test'
    };

    beforeEach(async () => {
      jest.spyOn(integrator.claudeCodeClient, 'checkAvailability').mockResolvedValue(true);
      jest.spyOn(integrator.prValidator, 'initialize').mockResolvedValue();
      jest.spyOn(integrator.codeAnalyzer, 'initialize').mockResolvedValue();
      
      await integrator.initialize();
    });

    test('should debug code successfully', async () => {
      const mockDebugResult = {
        success: true,
        diagnosis: { issue: 'Memory leak detected' },
        fixes: [{ description: 'Add proper cleanup' }],
        explanation: 'The issue is caused by...',
        confidence: 0.85
      };

      jest.spyOn(integrator.claudeCodeClient, 'debugCode')
        .mockResolvedValue(mockDebugResult);

      const result = await integrator.debugCode(mockEnvironment, 'Memory leak in component');

      expect(result).toEqual(mockDebugResult);
      expect(integrator.claudeCodeClient.debugCode).toHaveBeenCalledWith({
        environment: mockEnvironment,
        issue: 'Memory leak in component',
        context: {}
      });
    });

    test('should fail if debugging is disabled', async () => {
      const disabledIntegrator = new ClaudeCodeIntegrator({
        ...mockConfig,
        enableDebugging: false
      });

      await expect(disabledIntegrator.debugCode(mockEnvironment, 'test issue'))
        .rejects.toThrow('Debugging is disabled in configuration');
    });
  });

  describe('Status and Monitoring', () => {
    test('should return validation statistics', () => {
      // Add some mock validation history
      integrator.validationHistory = [
        { status: 'completed', duration: 1000 },
        { status: 'completed', duration: 2000 },
        { status: 'failed', duration: 500 }
      ];

      const stats = integrator.getValidationStats();

      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe(66.66666666666666);
      expect(stats.averageDuration).toBe(1500);
    });

    test('should return active validations', () => {
      // Add mock active validation
      integrator.activeValidations.set('test-id', {
        prNumber: 123,
        status: 'validating',
        startTime: new Date()
      });

      const active = integrator.getActiveValidations();

      expect(active).toHaveLength(1);
      expect(active[0].prNumber).toBe(123);
      expect(active[0].status).toBe('validating');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      // Add mock active validations
      integrator.activeValidations.set('test-1', { status: 'running' });
      integrator.activeValidations.set('test-2', { status: 'running' });

      // Mock WSL2 manager shutdown
      jest.spyOn(integrator.wsl2Manager, 'shutdown').mockResolvedValue();

      await integrator.shutdown();

      expect(integrator.activeValidations.size).toBe(0);
      expect(integrator.isInitialized).toBe(false);
    });
  });
});

describe('Claude Code Client', () => {
  let client;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      claudeCodePath: 'claude-code',
      validationTimeout: 30000
    };

    client = new ClaudeCodeClient(mockConfig);
  });

  describe('Command Execution', () => {
    test('should execute commands successfully', async () => {
      const mockResult = {
        stdout: '{"success": true, "issues": []}',
        stderr: '',
        code: 0
      };

      jest.spyOn(client, 'executeCommand').mockResolvedValue(mockResult);

      const result = await client.validateCode({
        environment: { workingDirectory: '/tmp/test' },
        files: ['test.js'],
        context: { prTitle: 'Test PR' }
      });

      expect(result.success).toBe(true);
      expect(client.executeCommand).toHaveBeenCalledWith([
        'validate',
        '--path', '/tmp/test',
        '--format', 'json',
        '--files', 'test.js',
        '--context', '{"prTitle":"Test PR"}'
      ], {
        cwd: '/tmp/test',
        timeout: 30000
      });
    });

    test('should handle command failures', async () => {
      jest.spyOn(client, 'executeCommand')
        .mockRejectedValue(new Error('Command failed'));

      await expect(client.validateCode({
        environment: { workingDirectory: '/tmp/test' },
        files: [],
        context: {}
      })).rejects.toThrow('Command failed');
    });

    test('should parse validation results correctly', () => {
      const mockOutput = {
        stdout: JSON.stringify({
          issues: [{ type: 'error', message: 'Syntax error' }],
          suggestions: [{ type: 'improvement', message: 'Add tests' }],
          metrics: { complexity: 5 },
          summary: { filesAnalyzed: 1 }
        }),
        stderr: '',
        code: 0
      };

      const result = client.parseValidationResult(mockOutput);

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(1);
      expect(result.suggestions).toHaveLength(1);
      expect(result.metrics.complexity).toBe(5);
    });

    test('should handle invalid JSON in results', () => {
      const mockOutput = {
        stdout: 'invalid json',
        stderr: '',
        code: 0
      };

      const result = client.parseValidationResult(mockOutput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse validation result');
      expect(result.rawOutput).toBe('invalid json');
    });
  });

  describe('Health Check', () => {
    test('should return healthy status when CLI is available', async () => {
      jest.spyOn(client, 'checkAvailability').mockResolvedValue(true);

      const health = await client.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.claudeCodePath).toBe('claude-code');
    });

    test('should return unhealthy status when CLI is not available', async () => {
      jest.spyOn(client, 'checkAvailability')
        .mockRejectedValue(new Error('CLI not found'));

      const health = await client.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('CLI not found');
    });
  });
});

