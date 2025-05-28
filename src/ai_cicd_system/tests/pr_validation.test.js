/**
 * PR Validation Tests
 * Tests for the PR validation workflow and components
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PRValidationWorkflow } from '../workflows/pr_validation_workflow.js';
import { PRValidator } from '../integrations/pr_validator.js';

// Mock the logger
jest.mock('../utils/simple_logger.js', () => ({
  log: jest.fn()
}));

describe('PR Validation Workflow', () => {
  let workflow;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      enableParallelValidation: true,
      maxRetries: 2,
      retryDelay: 1000,
      timeoutMs: 60000
    };

    workflow = new PRValidationWorkflow(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      jest.spyOn(workflow.claudeCodeIntegrator, 'initialize').mockResolvedValue();

      await workflow.initialize();

      expect(workflow.isInitialized).toBe(true);
      expect(workflow.claudeCodeIntegrator.initialize).toHaveBeenCalled();
    });

    test('should fail initialization if integrator fails', async () => {
      jest.spyOn(workflow.claudeCodeIntegrator, 'initialize')
        .mockRejectedValue(new Error('Integrator initialization failed'));

      await expect(workflow.initialize()).rejects.toThrow('Integrator initialization failed');
      expect(workflow.isInitialized).toBe(false);
    });
  });

  describe('PR Validation Process', () => {
    const mockPRDetails = {
      prNumber: 456,
      repository: 'https://github.com/test/repo.git',
      headBranch: 'feature/validation-test',
      title: 'Add validation feature',
      description: 'This PR adds validation functionality',
      author: 'developer',
      modifiedFiles: ['src/validator.js', 'tests/validator.test.js'],
      state: 'open'
    };

    beforeEach(async () => {
      jest.spyOn(workflow.claudeCodeIntegrator, 'initialize').mockResolvedValue();
      await workflow.initialize();
    });

    test('should complete full validation workflow successfully', async () => {
      const mockValidationResult = {
        success: true,
        issues: [],
        suggestions: [{ type: 'improvement', message: 'Consider adding more tests' }],
        metrics: { complexity: 3, coverage: 85 },
        summary: { filesAnalyzed: 2, issuesFound: 0 }
      };

      // Mock Claude Code integrator validation
      jest.spyOn(workflow.claudeCodeIntegrator, 'validatePR')
        .mockResolvedValue(mockValidationResult);

      const result = await workflow.validatePR(mockPRDetails);

      expect(result).toBeDefined();
      expect(result.workflowId).toBeDefined();
      expect(result.validation).toEqual(mockValidationResult);
      expect(result.workflow.status).toBe('completed');
      expect(result.summary.validationPassed).toBe(true);
    });

    test('should handle validation failures', async () => {
      jest.spyOn(workflow.claudeCodeIntegrator, 'validatePR')
        .mockRejectedValue(new Error('Validation failed'));

      await expect(workflow.validatePR(mockPRDetails)).rejects.toThrow('Validation failed');
    });

    test('should validate PR details before processing', async () => {
      const invalidPR = {
        // Missing required fields
        title: 'Test PR'
      };

      await expect(workflow.validatePR(invalidPR)).rejects.toThrow('Missing required PR detail');
    });

    test('should handle closed PR appropriately', async () => {
      const closedPR = {
        ...mockPRDetails,
        state: 'closed'
      };

      await expect(workflow.validatePR(closedPR)).rejects.toThrow('Cannot validate closed PR');
    });

    test('should process validation results correctly', async () => {
      const mockValidationResult = {
        success: true,
        issues: [
          { type: 'security', severity: 'error', message: 'Security vulnerability' },
          { type: 'style', severity: 'warning', message: 'Style issue' }
        ],
        suggestions: [],
        metrics: { complexity: 8, coverage: 60 }
      };

      jest.spyOn(workflow.claudeCodeIntegrator, 'validatePR')
        .mockResolvedValue(mockValidationResult);

      const result = await workflow.validatePR(mockPRDetails);

      expect(result.postProcessing.processedResults.status).toBe('failed'); // Due to security issue
      expect(result.postProcessing.businessRuleResults.blockingIssues).toHaveLength(1);
    });

    test('should generate appropriate recommendations', async () => {
      const mockValidationResult = {
        success: true,
        issues: [
          { type: 'security', severity: 'error', message: 'SQL injection vulnerability' }
        ],
        suggestions: [],
        metrics: { complexity: 5, coverage: 45 }
      };

      jest.spyOn(workflow.claudeCodeIntegrator, 'validatePR')
        .mockResolvedValue(mockValidationResult);

      const result = await workflow.validatePR(mockPRDetails);

      const recommendations = result.postProcessing.recommendations;
      expect(recommendations).toHaveLength(2); // Security + coverage
      expect(recommendations[0].priority).toBe('critical');
      expect(recommendations[0].type).toBe('security_issues');
    });

    test('should track workflow steps', async () => {
      const mockValidationResult = {
        success: true,
        issues: [],
        suggestions: [],
        metrics: {}
      };

      jest.spyOn(workflow.claudeCodeIntegrator, 'validatePR')
        .mockResolvedValue(mockValidationResult);

      const result = await workflow.validatePR(mockPRDetails);

      expect(result.workflow.steps).toHaveLength(4);
      expect(result.workflow.steps[0].name).toBe('pre_validation_checks');
      expect(result.workflow.steps[1].name).toBe('validation');
      expect(result.workflow.steps[2].name).toBe('post_validation_processing');
      expect(result.workflow.steps[3].name).toBe('final_report');

      // All steps should be completed
      result.workflow.steps.forEach(step => {
        expect(step.status).toBe('completed');
      });
    });

    test('should retry on failure if configured', async () => {
      let callCount = 0;
      jest.spyOn(workflow.claudeCodeIntegrator, 'validatePR')
        .mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Temporary failure');
          }
          return Promise.resolve({
            success: true,
            issues: [],
            suggestions: [],
            metrics: {}
          });
        });

      const result = await workflow.validatePR(mockPRDetails, { retry: true });

      expect(callCount).toBe(2); // Initial call + 1 retry
      expect(result.workflow.status).toBe('completed');
    });
  });

  describe('Workflow Management', () => {
    test('should track active workflows', async () => {
      jest.spyOn(workflow.claudeCodeIntegrator, 'initialize').mockResolvedValue();
      await workflow.initialize();

      // Mock a long-running validation
      jest.spyOn(workflow.claudeCodeIntegrator, 'validatePR')
        .mockImplementation(() => new Promise(() => {})); // Never resolves

      const validationPromise = workflow.validatePR({
        prNumber: 123,
        repository: 'test',
        headBranch: 'test',
        modifiedFiles: []
      });

      // Check that workflow is tracked
      const activeWorkflows = workflow.getActiveWorkflows();
      expect(activeWorkflows).toHaveLength(1);
      expect(activeWorkflows[0].prNumber).toBe(123);
    });

    test('should cancel workflows', async () => {
      jest.spyOn(workflow.claudeCodeIntegrator, 'initialize').mockResolvedValue();
      await workflow.initialize();

      // Start a workflow
      const workflowPromise = workflow.validatePR({
        prNumber: 789,
        repository: 'test',
        headBranch: 'test',
        modifiedFiles: []
      });

      // Get the workflow ID
      const activeWorkflows = workflow.getActiveWorkflows();
      const workflowId = activeWorkflows[0].id;

      // Cancel the workflow
      const cancelled = await workflow.cancelWorkflow(workflowId);

      expect(cancelled).toBe(true);
      expect(workflow.getActiveWorkflows()).toHaveLength(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      jest.spyOn(workflow.claudeCodeIntegrator, 'initialize').mockResolvedValue();
      jest.spyOn(workflow.claudeCodeIntegrator, 'shutdown').mockResolvedValue();
      
      await workflow.initialize();

      // Add mock active workflow
      workflow.activeWorkflows.set('test-id', { status: 'running' });

      await workflow.shutdown();

      expect(workflow.activeWorkflows.size).toBe(0);
      expect(workflow.isInitialized).toBe(false);
      expect(workflow.claudeCodeIntegrator.shutdown).toHaveBeenCalled();
    });
  });
});

describe('PR Validator', () => {
  let validator;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      validationTimeout: 30000,
      validationRules: {
        maxFileSize: 1024 * 1024, // 1MB
        allowedFileExtensions: ['.js', '.ts', '.jsx', '.tsx'],
        maxLinesPerFile: 500,
        requireTests: true
      }
    };

    validator = new PRValidator(mockConfig);
  });

  describe('Initialization', () => {
    test('should initialize with default rules', async () => {
      await validator.initialize();

      expect(validator.isInitialized).toBe(true);
      expect(validator.validationRules).toBeDefined();
      expect(validator.validationRules.maxFileSize).toBe(1024 * 1024);
    });

    test('should merge custom rules with defaults', async () => {
      const customValidator = new PRValidator({
        validationRules: {
          maxFileSize: 2048,
          customRule: true
        }
      });

      await customValidator.initialize();

      expect(customValidator.validationRules.maxFileSize).toBe(2048);
      expect(customValidator.validationRules.customRule).toBe(true);
      expect(customValidator.validationRules.allowedFileExtensions).toBeDefined(); // Default rule
    });
  });

  describe('PR Validation', () => {
    const mockPRDetails = {
      prNumber: 101,
      modifiedFiles: ['src/component.js', 'src/utils.ts', 'tests/component.test.js']
    };

    const mockEnvironment = {
      workingDirectory: '/tmp/test',
      type: 'local'
    };

    beforeEach(async () => {
      await validator.initialize();
    });

    test('should validate PR successfully', async () => {
      // Mock file validation methods
      jest.spyOn(validator, 'getFileSize').mockResolvedValue(1000);
      jest.spyOn(validator, 'getFileLineCount').mockResolvedValue(100);
      jest.spyOn(validator, 'checkForHardcodedSecrets').mockResolvedValue([]);
      jest.spyOn(validator, 'checkForSqlInjection').mockResolvedValue([]);
      jest.spyOn(validator, 'checkCodeStyle').mockResolvedValue([]);

      const result = await validator.validatePR(mockPRDetails, mockEnvironment);

      expect(result.status).toBe('passed');
      expect(result.prNumber).toBe(101);
      expect(result.validations.files).toBeDefined();
      expect(result.validations.quality).toBeDefined();
      expect(result.validations.security).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
    });

    test('should detect file size violations', async () => {
      jest.spyOn(validator, 'getFileSize').mockResolvedValue(2 * 1024 * 1024); // 2MB
      jest.spyOn(validator, 'getFileLineCount').mockResolvedValue(100);
      jest.spyOn(validator, 'checkForHardcodedSecrets').mockResolvedValue([]);
      jest.spyOn(validator, 'checkForSqlInjection').mockResolvedValue([]);
      jest.spyOn(validator, 'checkCodeStyle').mockResolvedValue([]);

      const result = await validator.validatePR(mockPRDetails, mockEnvironment);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].type).toBe('file_size');
      expect(result.status).toBe('failed');
    });

    test('should detect missing test files', async () => {
      const prWithoutTests = {
        prNumber: 102,
        modifiedFiles: ['src/component.js', 'src/utils.ts'] // No test files
      };

      jest.spyOn(validator, 'getFileSize').mockResolvedValue(1000);
      jest.spyOn(validator, 'getFileLineCount').mockResolvedValue(100);
      jest.spyOn(validator, 'checkForHardcodedSecrets').mockResolvedValue([]);
      jest.spyOn(validator, 'checkForSqlInjection').mockResolvedValue([]);
      jest.spyOn(validator, 'checkCodeStyle').mockResolvedValue([]);

      const result = await validator.validatePR(prWithoutTests, mockEnvironment);

      expect(result.warnings.some(w => w.type === 'missing_tests')).toBe(true);
    });

    test('should detect security issues', async () => {
      jest.spyOn(validator, 'getFileSize').mockResolvedValue(1000);
      jest.spyOn(validator, 'getFileLineCount').mockResolvedValue(100);
      jest.spyOn(validator, 'checkForHardcodedSecrets')
        .mockResolvedValue(['password', 'api_key']);
      jest.spyOn(validator, 'checkForSqlInjection').mockResolvedValue([]);
      jest.spyOn(validator, 'checkCodeStyle').mockResolvedValue([]);

      const result = await validator.validatePR(mockPRDetails, mockEnvironment);

      expect(result.issues.some(i => i.type === 'hardcoded_secrets')).toBe(true);
      expect(result.status).toBe('failed');
    });

    test('should calculate validation score correctly', async () => {
      jest.spyOn(validator, 'getFileSize').mockResolvedValue(1000);
      jest.spyOn(validator, 'getFileLineCount').mockResolvedValue(100);
      jest.spyOn(validator, 'checkForHardcodedSecrets').mockResolvedValue([]);
      jest.spyOn(validator, 'checkForSqlInjection').mockResolvedValue([]);
      jest.spyOn(validator, 'checkCodeStyle').mockResolvedValue([]);

      const result = await validator.validatePR(mockPRDetails, mockEnvironment);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      
      // With no issues, score should be high
      expect(result.score).toBeGreaterThan(90);
    });

    test('should handle validation errors gracefully', async () => {
      jest.spyOn(validator, 'getFileSize')
        .mockRejectedValue(new Error('File access error'));

      const result = await validator.validatePR(mockPRDetails, mockEnvironment);

      expect(result.status).toBe('error');
      expect(result.error).toBe('File access error');
    });
  });

  describe('Validation Rules', () => {
    test('should identify code files correctly', () => {
      expect(validator.isCodeFile('src/component.js')).toBe(true);
      expect(validator.isCodeFile('src/utils.ts')).toBe(true);
      expect(validator.isCodeFile('README.md')).toBe(false);
      expect(validator.isCodeFile('package.json')).toBe(false);
    });

    test('should detect corresponding test files', () => {
      const files = [
        'src/component.js',
        'src/component.test.js',
        'src/utils.ts',
        'tests/utils.js'
      ];

      expect(validator.hasCorrespondingTestFile('src/component.js', files)).toBe(true);
      expect(validator.hasCorrespondingTestFile('src/utils.ts', files)).toBe(false);
    });

    test('should get file extensions correctly', () => {
      expect(validator.getFileExtension('file.js')).toBe('.js');
      expect(validator.getFileExtension('path/to/file.tsx')).toBe('.tsx');
      expect(validator.getFileExtension('no-extension')).toBe('');
    });
  });
});

