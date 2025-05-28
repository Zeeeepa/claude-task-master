/**
 * @fileoverview Codegen Integration Tests
 * @description Comprehensive tests for Codegen SDK integration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CodegenClient } from '../../../src/ai_cicd_system/integrations/codegen/client.js';
import { TaskAnalyzer } from '../../../src/ai_cicd_system/integrations/codegen/task_analyzer.js';
import { PromptGenerator } from '../../../src/ai_cicd_system/integrations/codegen/prompt_generator.js';
import { PRCreator } from '../../../src/ai_cicd_system/integrations/codegen/pr_creator.js';
import { ContextManager } from '../../../src/ai_cicd_system/integrations/codegen/context_manager.js';

describe('Codegen Integration Tests', () => {
  let codegenClient;
  let taskAnalyzer;
  let promptGenerator;
  let prCreator;
  let contextManager;

  beforeEach(() => {
    // Initialize components with test configuration
    codegenClient = new CodegenClient({
      mode: 'test',
      api: {
        baseURL: 'https://api.test.codegen.sh',
        timeout: 5000
      },
      auth: {
        orgId: 'test-org',
        token: 'test-token',
        validateOnInit: false
      }
    });

    taskAnalyzer = new TaskAnalyzer({
      maxComplexityScore: 100,
      enableDetailedAnalysis: true
    });

    promptGenerator = new PromptGenerator({
      maxPromptLength: 4000,
      includeContext: true,
      optimizeForCodegen: true
    });

    prCreator = new PRCreator({
      defaultBranch: 'main',
      branchPrefix: 'codegen-test/',
      includeMetadata: true
    });

    contextManager = new ContextManager({
      maxContextSize: 10000,
      enableSmartFiltering: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CodegenClient', () => {
    test('should initialize successfully', async () => {
      await expect(codegenClient.initialize()).resolves.not.toThrow();
      expect(codegenClient.isInitialized).toBe(true);
    });

    test('should create PR request successfully', async () => {
      await codegenClient.initialize();
      
      const request = {
        description: 'Create a user authentication function',
        repository: 'test/repo',
        context: {
          language: 'javascript',
          framework: 'express'
        }
      };

      const result = await codegenClient.createPR(request);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('repository', 'test/repo');
      expect(result).toHaveProperty('description', 'Create a user authentication function');
    });

    test('should handle API errors gracefully', async () => {
      await codegenClient.initialize();
      
      // Mock API error
      jest.spyOn(codegenClient.agent, 'run').mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const request = {
        description: 'Test task',
        repository: 'test/repo'
      };

      const result = await codegenClient.createPR(request);
      
      expect(result.success).toBe(false);
      expect(result.error).toHaveProperty('message');
    });

    test('should get task status', async () => {
      await codegenClient.initialize();
      
      // Mock task status
      jest.spyOn(codegenClient.agent, 'getTask').mockResolvedValue({
        id: 'test-task-123',
        status: 'completed',
        progress: 100,
        result: { pr_url: 'https://github.com/test/repo/pull/123' }
      });

      const status = await codegenClient.getTaskStatus('test-task-123');
      
      expect(status).toHaveProperty('id', 'test-task-123');
      expect(status).toHaveProperty('status', 'completed');
      expect(status).toHaveProperty('progress', 100);
    });

    test('should get health status', async () => {
      await codegenClient.initialize();
      
      const health = await codegenClient.getHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('lastCheck');
    });
  });

  describe('TaskAnalyzer', () => {
    test('should analyze simple task correctly', async () => {
      const description = 'Create a function to validate email addresses';
      const context = { language: 'javascript' };

      const analysis = await taskAnalyzer.analyzeTask(description, context);

      expect(analysis).toHaveProperty('intent');
      expect(analysis).toHaveProperty('complexity');
      expect(analysis).toHaveProperty('requirements');
      expect(analysis).toHaveProperty('technologies');
      expect(analysis.intent.primary).toBe('create');
      expect(analysis.complexity.level).toBe('simple');
    });

    test('should analyze complex task correctly', async () => {
      const description = 'Implement a distributed microservice architecture with authentication, database integration, and real-time notifications';
      const context = { language: 'javascript', framework: 'express' };

      const analysis = await taskAnalyzer.analyzeTask(description, context);

      expect(analysis.complexity.level).toBe('complex');
      expect(analysis.technologies.languages).toContain('javascript');
      expect(analysis.riskFactors.length).toBeGreaterThan(0);
    });

    test('should extract requirements correctly', async () => {
      const description = 'The system should validate user input and must handle errors gracefully';
      
      const analysis = await taskAnalyzer.analyzeTask(description);

      expect(analysis.requirements.functional.length).toBeGreaterThan(0);
      expect(analysis.requirements.functional.some(req => 
        req.text.includes('validate')
      )).toBe(true);
    });

    test('should identify technologies correctly', async () => {
      const description = 'Create a React component with TypeScript for user authentication';
      
      const analysis = await taskAnalyzer.analyzeTask(description);

      expect(analysis.technologies.languages).toContain('typescript');
      expect(analysis.technologies.frameworks).toContain('react');
    });
  });

  describe('PromptGenerator', () => {
    test('should generate prompt for create intent', async () => {
      const analysis = {
        originalDescription: 'Create a user login function',
        intent: { primary: 'create', description: 'Creating new functionality' },
        complexity: { level: 'medium' },
        technologies: { languages: ['javascript'], frameworks: ['express'] },
        requirements: { functional: [{ text: 'validate credentials' }] }
      };

      const prompt = await promptGenerator.generatePrompt(analysis);

      expect(prompt).toHaveProperty('content');
      expect(prompt).toHaveProperty('metadata');
      expect(prompt.content).toContain('Create');
      expect(prompt.content).toContain('user login function');
      expect(prompt.metadata.intent).toBe('create');
    });

    test('should generate code-specific prompt', async () => {
      const taskSpec = {
        type: 'function',
        name: 'validateEmail',
        description: 'Validate email address format',
        parameters: [
          { name: 'email', type: 'string', description: 'Email to validate' }
        ],
        returnType: 'boolean',
        language: 'javascript'
      };

      const prompt = await promptGenerator.generateCodePrompt(taskSpec);

      expect(prompt.content).toContain('validateEmail');
      expect(prompt.content).toContain('javascript');
      expect(prompt.content).toContain('email');
      expect(prompt.metadata.type).toBe('code_generation');
    });

    test('should optimize prompt length', async () => {
      const analysis = {
        originalDescription: 'A'.repeat(5000), // Very long description
        intent: { primary: 'create' },
        complexity: { level: 'simple' },
        technologies: { languages: ['javascript'] },
        requirements: { functional: [] }
      };

      const prompt = await promptGenerator.generatePrompt(analysis);

      expect(prompt.metadata.estimatedTokens).toBeLessThan(4000);
    });
  });

  describe('PRCreator', () => {
    test('should create PR data for feature', async () => {
      const codegenResult = {
        taskId: 'test-123',
        success: true,
        prUrl: 'https://github.com/test/repo/pull/123',
        files: [
          { path: 'src/auth.js', description: 'Authentication logic' }
        ]
      };

      const analysis = {
        originalDescription: 'Add user authentication',
        intent: { primary: 'create', description: 'Creating new functionality' },
        complexity: { level: 'medium' },
        technologies: { languages: ['javascript'] },
        riskFactors: []
      };

      const prData = await prCreator.createPR(codegenResult, analysis);

      expect(prData).toHaveProperty('title');
      expect(prData).toHaveProperty('body');
      expect(prData).toHaveProperty('head');
      expect(prData).toHaveProperty('base', 'main');
      expect(prData.title).toContain('feat:');
      expect(prData.labels).toContain('feature');
    });

    test('should create PR data for bugfix', async () => {
      const codegenResult = {
        taskId: 'test-456',
        success: true
      };

      const analysis = {
        originalDescription: 'Fix login validation bug',
        intent: { primary: 'fix', description: 'Fixing bugs' },
        complexity: { level: 'simple' },
        technologies: { languages: ['javascript'] },
        riskFactors: []
      };

      const prData = await prCreator.createPR(codegenResult, analysis);

      expect(prData.title).toContain('fix:');
      expect(prData.labels).toContain('bugfix');
    });

    test('should mark complex PRs as draft', async () => {
      const codegenResult = { taskId: 'test-789', success: true };

      const analysis = {
        originalDescription: 'Implement complex microservice architecture',
        intent: { primary: 'create' },
        complexity: { level: 'complex' },
        technologies: { languages: ['javascript'] },
        riskFactors: ['Breaking changes', 'Security implications']
      };

      const prData = await prCreator.createPR(codegenResult, analysis);

      expect(prData.draft).toBe(true);
    });
  });

  describe('ContextManager', () => {
    test('should build context successfully', async () => {
      const analysis = {
        originalDescription: 'Create authentication function',
        intent: { primary: 'create' },
        complexity: { level: 'medium' },
        technologies: { languages: ['javascript'], frameworks: ['express'] }
      };

      const context = await contextManager.buildContext(analysis);

      expect(context).toHaveProperty('task');
      expect(context).toHaveProperty('codebase');
      expect(context).toHaveProperty('environment');
      expect(context).toHaveProperty('constraints');
      expect(context).toHaveProperty('metadata');
      expect(context.metadata.contextSize).toBeGreaterThan(0);
    });

    test('should optimize large context', async () => {
      const analysis = {
        originalDescription: 'A'.repeat(10000), // Large description
        intent: { primary: 'create' },
        complexity: { level: 'complex' },
        technologies: { languages: ['javascript'] }
      };

      const context = await contextManager.buildContext(analysis);

      expect(context.metadata.contextSize).toBeLessThanOrEqual(10000);
      expect(context.metadata.optimized).toBe(true);
    });

    test('should find relevant files', async () => {
      const analysis = {
        originalDescription: 'Update user authentication',
        intent: { primary: 'modify' },
        complexity: { level: 'medium' },
        technologies: { languages: ['javascript'] },
        fileTypes: ['js']
      };

      const context = await contextManager.buildContext(analysis);

      expect(context.codebase.relevantFiles).toBeInstanceOf(Array);
      expect(context.codebase.relevantFiles.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Integration', () => {
    test('should complete full workflow', async () => {
      // Initialize all components
      await codegenClient.initialize();

      // Step 1: Analyze task
      const taskDescription = 'Create a REST API endpoint for user registration';
      const analysis = await taskAnalyzer.analyzeTask(taskDescription, {
        language: 'javascript',
        framework: 'express'
      });

      expect(analysis.intent.primary).toBe('create');

      // Step 2: Build context
      const context = await contextManager.buildContext(analysis);
      expect(context.metadata.contextSize).toBeGreaterThan(0);

      // Step 3: Generate prompt
      const prompt = await promptGenerator.generatePrompt(analysis, { context });
      expect(prompt.content).toContain('REST API');

      // Step 4: Create PR with Codegen (mocked)
      const mockCodegenResult = {
        taskId: 'test-workflow-123',
        success: true,
        prUrl: 'https://github.com/test/repo/pull/456',
        files: [
          { path: 'src/routes/users.js', description: 'User registration endpoint' }
        ]
      };

      // Step 5: Create PR data
      const prData = await prCreator.createPR(mockCodegenResult, analysis);
      expect(prData.title).toContain('feat:');
      expect(prData.body).toContain('REST API');

      // Verify complete workflow
      expect(analysis).toBeDefined();
      expect(context).toBeDefined();
      expect(prompt).toBeDefined();
      expect(prData).toBeDefined();
    });

    test('should handle workflow errors gracefully', async () => {
      // Test with invalid task
      const invalidTask = '';

      await expect(
        taskAnalyzer.analyzeTask(invalidTask)
      ).rejects.toThrow();
    });

    test('should process multiple tasks in sequence', async () => {
      const tasks = [
        'Create user authentication function',
        'Add input validation',
        'Implement error handling'
      ];

      const results = [];

      for (const task of tasks) {
        const analysis = await taskAnalyzer.analyzeTask(task);
        results.push(analysis);
      }

      expect(results).toHaveLength(3);
      expect(results.every(r => r.intent.primary === 'create')).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should analyze task within time limit', async () => {
      const startTime = Date.now();
      
      await taskAnalyzer.analyzeTask(
        'Create a complex distributed system with microservices'
      );
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    test('should generate prompt within time limit', async () => {
      const analysis = {
        originalDescription: 'Create authentication system',
        intent: { primary: 'create' },
        complexity: { level: 'medium' },
        technologies: { languages: ['javascript'] },
        requirements: { functional: [] }
      };

      const startTime = Date.now();
      
      await promptGenerator.generatePrompt(analysis);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // 2 seconds
    });

    test('should build context within time limit', async () => {
      const analysis = {
        originalDescription: 'Create API endpoint',
        intent: { primary: 'create' },
        complexity: { level: 'simple' },
        technologies: { languages: ['javascript'] }
      };

      const startTime = Date.now();
      
      await contextManager.buildContext(analysis);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000); // 3 seconds
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      // Mock network error
      jest.spyOn(codegenClient.agent, 'run').mockRejectedValue(
        new Error('Network timeout')
      );

      await codegenClient.initialize();

      const result = await codegenClient.createPR({
        description: 'Test task',
        repository: 'test/repo'
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Network timeout');
    });

    test('should handle invalid configuration', () => {
      expect(() => {
        new CodegenClient({
          auth: {
            // Missing required fields
          }
        });
      }).not.toThrow(); // Should not throw during construction
    });

    test('should validate task input', async () => {
      await expect(
        taskAnalyzer.analyzeTask(null)
      ).rejects.toThrow();

      await expect(
        taskAnalyzer.analyzeTask('')
      ).rejects.toThrow();
    });
  });
});

describe('Integration Test Utilities', () => {
  test('should create test configuration', () => {
    const config = {
      codegen: {
        mode: 'test',
        api: { baseURL: 'https://api.test.codegen.sh' },
        auth: { orgId: 'test', token: 'test' }
      },
      taskAnalyzer: { enableDetailedAnalysis: false },
      promptGenerator: { maxPromptLength: 1000 },
      prCreator: { includeMetadata: false },
      contextManager: { maxContextSize: 5000 }
    };

    expect(config).toHaveProperty('codegen');
    expect(config).toHaveProperty('taskAnalyzer');
    expect(config).toHaveProperty('promptGenerator');
    expect(config).toHaveProperty('prCreator');
    expect(config).toHaveProperty('contextManager');
  });

  test('should mock external dependencies', () => {
    const mockCodegenAgent = {
      run: jest.fn().mockResolvedValue({
        id: 'mock-task',
        status: 'completed',
        result: { pr_url: 'https://github.com/test/repo/pull/123' }
      }),
      getTask: jest.fn().mockResolvedValue({
        id: 'mock-task',
        status: 'completed'
      })
    };

    expect(mockCodegenAgent.run).toBeDefined();
    expect(mockCodegenAgent.getTask).toBeDefined();
  });
});

