/**
 * Comprehensive Codegen SDK Integration
 * 
 * Consolidates functionality from PRs #83, #86, #87 into a single
 * comprehensive SDK integration for natural language to PR creation.
 * 
 * Features:
 * - Natural language processing and task analysis
 * - Database-driven prompt generation with context enrichment
 * - Webhook integration with GitHub and Linear
 * - Advanced error recovery with circuit breaker
 * - Template management and versioning
 * - Real-time status tracking and notifications
 * - Comprehensive validation and testing framework
 */

import { EventEmitter } from 'events';
import { CodegenClient } from './codegen-client.js';
import { TaskAnalyzer } from './task-analyzer.js';
import { PromptGenerator } from './prompt-generator.js';
import { PRCreator } from './pr-creator.js';
import { ContextManager } from './context-manager.js';
import { RequirementExtractor } from '../nlp/requirement-extractor.js';
import { CodeIntentAnalyzer } from '../nlp/code-intent-analyzer.js';
import { TemplateEngine } from '../nlp/template-engine.js';
import { TaskProcessor } from '../workflow/task-processor.js';
import { PRWorkflow } from '../workflow/pr-workflow.js';
import { StatusUpdater } from '../workflow/status-updater.js';
import { DatabasePromptGenerator } from './database-prompt-generator.js';
import { AdvancedErrorRecovery } from './advanced-error-recovery.js';
import { WebhookHandler } from '../webhooks/webhook-handler.js';

export class CodegenSDKIntegration extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Codegen API Configuration
      codegen: {
        apiKey: process.env.CODEGEN_API_KEY,
        orgId: process.env.CODEGEN_ORG_ID,
        apiUrl: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
        timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 60000,
        maxRetries: parseInt(process.env.CODEGEN_MAX_RETRIES) || 3,
        enableMock: process.env.CODEGEN_ENABLE_MOCK === 'true'
      },
      
      // Natural Language Processing
      nlp: {
        enableDetailedAnalysis: true,
        enableTemplateGeneration: true,
        enableContextEnrichment: true,
        maxContextSize: 50000,
        confidenceThreshold: 0.6
      },
      
      // Database Integration
      database: {
        enabled: process.env.DATABASE_ENABLED === 'true',
        promptVersioning: true,
        contextCaching: true,
        cacheSize: 100,
        cacheTTL: 3600000 // 1 hour
      },
      
      // Webhook Integration
      webhooks: {
        enabled: true,
        github: {
          secret: process.env.GITHUB_WEBHOOK_SECRET,
          signatureValidation: true
        },
        linear: {
          apiKey: process.env.LINEAR_API_KEY,
          teamId: process.env.LINEAR_TEAM_ID
        }
      },
      
      // Error Recovery
      errorRecovery: {
        maxRetryAttempts: 5,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 60000
      },
      
      // Performance
      performance: {
        enableCaching: true,
        enableBatching: true,
        maxConcurrentTasks: 3,
        taskTimeout: 300000
      },
      
      ...config
    };
    
    // Core components
    this.codegenClient = null;
    this.taskAnalyzer = null;
    this.promptGenerator = null;
    this.prCreator = null;
    this.contextManager = null;
    this.requirementExtractor = null;
    this.codeIntentAnalyzer = null;
    this.templateEngine = null;
    this.taskProcessor = null;
    this.prWorkflow = null;
    this.statusUpdater = null;
    this.databasePromptGenerator = null;
    this.errorRecovery = null;
    this.webhookHandler = null;
    
    // State management
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    this.failedTasks = new Map();
    this.isInitialized = false;
    this.isRunning = false;
    
    // Metrics
    this.metrics = {
      tasksProcessed: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      prsCreated: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      nlpAnalysisCount: 0,
      promptGenerationCount: 0,
      errorRecoveryCount: 0
    };
  }

  /**
   * Initialize the Codegen SDK integration
   */
  async initialize() {
    if (this.isInitialized) {
      throw new Error('Codegen SDK Integration is already initialized');
    }

    try {
      console.log('Initializing Codegen SDK Integration...');
      
      // Initialize core components
      await this.initializeComponents();
      
      // Setup component interconnections
      this.setupComponentConnections();
      
      // Validate system health
      await this.validateSystemHealth();
      
      this.isInitialized = true;
      
      console.log('Codegen SDK Integration initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      console.error('Failed to initialize Codegen SDK Integration:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Initialize all core components
   */
  async initializeComponents() {
    // Initialize Codegen Client
    this.codegenClient = new CodegenClient(this.config.codegen);
    await this.codegenClient.initialize();
    
    // Initialize NLP components
    this.requirementExtractor = new RequirementExtractor(this.config.nlp);
    this.codeIntentAnalyzer = new CodeIntentAnalyzer(this.config.nlp);
    this.templateEngine = new TemplateEngine(this.config.nlp);
    
    // Initialize analysis components
    this.taskAnalyzer = new TaskAnalyzer({
      requirementExtractor: this.requirementExtractor,
      codeIntentAnalyzer: this.codeIntentAnalyzer,
      ...this.config.nlp
    });
    
    // Initialize context and prompt components
    this.contextManager = new ContextManager(this.config.nlp);
    this.promptGenerator = new PromptGenerator({
      contextManager: this.contextManager,
      templateEngine: this.templateEngine,
      ...this.config.nlp
    });
    
    // Initialize database prompt generator if enabled
    if (this.config.database.enabled) {
      this.databasePromptGenerator = new DatabasePromptGenerator(this.config.database);
      await this.databasePromptGenerator.initialize();
    }
    
    // Initialize PR creator
    this.prCreator = new PRCreator(this.config.pr || {});
    
    // Initialize workflow components
    this.taskProcessor = new TaskProcessor({
      taskAnalyzer: this.taskAnalyzer,
      promptGenerator: this.promptGenerator,
      codegenClient: this.codegenClient,
      ...this.config.performance
    });
    
    this.prWorkflow = new PRWorkflow({
      taskProcessor: this.taskProcessor,
      prCreator: this.prCreator,
      ...this.config.workflow || {}
    });
    
    this.statusUpdater = new StatusUpdater({
      linearApiKey: this.config.webhooks.linear.apiKey,
      ...this.config.status || {}
    });
    
    // Initialize error recovery
    this.errorRecovery = new AdvancedErrorRecovery(this.config.errorRecovery);
    
    // Initialize webhook handler if enabled
    if (this.config.webhooks.enabled) {
      this.webhookHandler = new WebhookHandler({
        github: this.config.webhooks.github,
        linear: this.config.webhooks.linear,
        integration: this
      });
      await this.webhookHandler.initialize();
    }
  }

  /**
   * Setup connections between components
   */
  setupComponentConnections() {
    // Task Processor -> Status Updater
    this.taskProcessor.on('taskStarted', ({ taskId, task }) => {
      this.statusUpdater.updateStatus(taskId, 'processing', {
        step: 'analysis',
        progress: 10
      });
    });
    
    this.taskProcessor.on('taskCompleted', ({ taskId, result }) => {
      this.statusUpdater.updateStatus(taskId, 'completed', {
        step: 'completed',
        progress: 100,
        result
      });
    });
    
    // PR Workflow -> Metrics
    this.prWorkflow.on('prCreated', ({ prData }) => {
      this.metrics.prsCreated++;
      this.emit('prCreated', { prData });
    });
    
    // Error Recovery -> Metrics
    this.errorRecovery.on('recoveryAttempt', () => {
      this.metrics.errorRecoveryCount++;
    });
    
    // Webhook Handler -> Task Processing
    if (this.webhookHandler) {
      this.webhookHandler.on('taskRequest', (taskData) => {
        this.processTask(taskData);
      });
    }
  }

  /**
   * Start the integration
   */
  async start() {
    if (!this.isInitialized) {
      throw new Error('Integration must be initialized before starting');
    }
    
    if (this.isRunning) {
      throw new Error('Integration is already running');
    }

    try {
      console.log('Starting Codegen SDK Integration...');
      
      // Start all components
      await this.taskProcessor.start();
      await this.prWorkflow.start();
      await this.statusUpdater.start();
      
      if (this.webhookHandler) {
        await this.webhookHandler.start();
      }
      
      this.isRunning = true;
      console.log('Codegen SDK Integration started successfully');
      this.emit('started');
      
    } catch (error) {
      console.error('Failed to start Codegen SDK Integration:', error);
      throw error;
    }
  }

  /**
   * Stop the integration
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('Stopping Codegen SDK Integration...');
      
      // Stop all components
      if (this.webhookHandler) {
        await this.webhookHandler.stop();
      }
      
      await this.statusUpdater.stop();
      await this.prWorkflow.stop();
      await this.taskProcessor.stop();
      
      this.isRunning = false;
      console.log('Codegen SDK Integration stopped successfully');
      this.emit('stopped');
      
    } catch (error) {
      console.error('Error stopping Codegen SDK Integration:', error);
      throw error;
    }
  }

  /**
   * Process a task using the comprehensive pipeline
   */
  async processTask(taskData, context = {}, options = {}) {
    const taskId = taskData.id || this.generateTaskId();
    const startTime = Date.now();
    
    try {
      console.log(`Processing task ${taskId}: ${taskData.description}`);
      
      // Create task record
      const task = {
        id: taskId,
        description: taskData.description,
        type: taskData.type || 'feature',
        context,
        options,
        status: 'processing',
        startTime: new Date(),
        steps: []
      };
      
      this.activeTasks.set(taskId, task);
      this.metrics.tasksProcessed++;
      
      this.emit('taskStarted', { taskId, task });
      
      // Step 1: Analyze task with NLP
      const analysis = await this.executeStep(task, 'nlp_analysis', async () => {
        return await this.taskAnalyzer.analyzeTask(taskData.description, context);
      });
      
      // Step 2: Generate enhanced prompt
      const prompt = await this.executeStep(task, 'prompt_generation', async () => {
        if (this.databasePromptGenerator) {
          return await this.databasePromptGenerator.generatePrompt(analysis, context);
        } else {
          return await this.promptGenerator.generatePrompt(analysis, context);
        }
      });
      
      // Step 3: Execute with Codegen API (with error recovery)
      const codegenResult = await this.executeStep(task, 'codegen_execution', async () => {
        return await this.errorRecovery.executeWithRecovery(async () => {
          return await this.codegenClient.createPR({
            description: taskData.description,
            prompt: prompt.content,
            context: {
              ...context,
              analysis,
              template: prompt.template
            }
          });
        });
      });
      
      // Step 4: Create PR if not already created
      let prResult = codegenResult;
      if (!codegenResult.prUrl) {
        prResult = await this.executeStep(task, 'pr_creation', async () => {
          return await this.prCreator.createPR({
            title: this.generatePRTitle(analysis),
            description: this.generatePRDescription(analysis, codegenResult),
            code: codegenResult.code,
            repository: context.repository,
            baseBranch: context.baseBranch || 'main'
          });
        });
      }
      
      // Complete task
      const processingTime = Date.now() - startTime;
      task.status = 'completed';
      task.endTime = new Date();
      task.processingTime = processingTime;
      task.result = {
        analysis,
        prompt,
        codegenResult,
        prResult
      };
      
      // Update metrics
      this.metrics.tasksCompleted++;
      this.metrics.totalProcessingTime += processingTime;
      this.metrics.averageProcessingTime = 
        this.metrics.totalProcessingTime / this.metrics.tasksCompleted;
      
      // Move to completed tasks
      this.activeTasks.delete(taskId);
      this.completedTasks.set(taskId, task);
      
      console.log(`Task ${taskId} completed in ${processingTime}ms`);
      this.emit('taskCompleted', { taskId, task, result: task.result });
      
      return {
        success: true,
        taskId,
        processingTime,
        analysis,
        prUrl: prResult.prUrl,
        prNumber: prResult.prNumber,
        result: task.result
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Handle task failure
      const task = this.activeTasks.get(taskId);
      if (task) {
        task.status = 'failed';
        task.endTime = new Date();
        task.processingTime = processingTime;
        task.error = error.message;
        
        this.activeTasks.delete(taskId);
        this.failedTasks.set(taskId, task);
      }
      
      this.metrics.tasksFailed++;
      
      console.error(`Task ${taskId} failed: ${error.message}`);
      this.emit('taskFailed', { taskId, error });
      
      throw error;
    }
  }

  /**
   * Execute a task step with error handling
   */
  async executeStep(task, stepName, stepFunction) {
    const step = {
      name: stepName,
      status: 'running',
      startTime: new Date(),
      endTime: null,
      result: null,
      error: null
    };
    
    task.steps.push(step);
    
    try {
      console.log(`Executing step: ${stepName} for task ${task.id}`);
      
      const result = await stepFunction();
      
      step.status = 'completed';
      step.endTime = new Date();
      step.result = result;
      
      // Update metrics based on step type
      switch (stepName) {
        case 'nlp_analysis':
          this.metrics.nlpAnalysisCount++;
          break;
        case 'prompt_generation':
          this.metrics.promptGenerationCount++;
          break;
      }
      
      return result;
      
    } catch (error) {
      step.status = 'failed';
      step.endTime = new Date();
      step.error = error.message;
      
      throw error;
    }
  }

  /**
   * Process multiple tasks in batch
   */
  async processBatch(tasks, options = {}) {
    const { concurrent = this.config.performance.maxConcurrentTasks, failFast = false } = options;
    const results = [];
    
    // Process tasks in batches
    for (let i = 0; i < tasks.length; i += concurrent) {
      const batch = tasks.slice(i, i + concurrent);
      const batchPromises = batch.map(task => 
        this.processTask(task).catch(error => ({ error, task }))
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ error: result.reason, success: false });
          
          if (failFast) {
            throw result.reason;
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(event, headers, rawBody) {
    if (!this.webhookHandler) {
      throw new Error('Webhook handler not initialized');
    }
    
    return await this.webhookHandler.handleEvent(event, headers, rawBody);
  }

  /**
   * Generate PR title from analysis
   */
  generatePRTitle(analysis) {
    const intent = analysis.intent?.primary || 'update';
    const scope = analysis.scope?.size || 'medium';
    
    return `${intent}: ${analysis.originalDescription}`.substring(0, 100);
  }

  /**
   * Generate PR description from analysis and result
   */
  generatePRDescription(analysis, codegenResult) {
    return `
## Description
${analysis.originalDescription}

## Changes
${codegenResult.summary || 'Code changes generated by AI'}

## Complexity
- Level: ${analysis.complexity?.level || 'medium'}
- Estimated effort: ${analysis.complexity?.estimatedHours || 'unknown'} hours

## Requirements
${analysis.requirements?.functional?.map(req => `- ${req.text}`).join('\n') || 'No specific requirements identified'}

## Generated by
Codegen SDK Integration - Automated PR creation
`;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    // Check active tasks
    if (this.activeTasks.has(taskId)) {
      return { found: true, ...this.activeTasks.get(taskId) };
    }
    
    // Check completed tasks
    if (this.completedTasks.has(taskId)) {
      return { found: true, ...this.completedTasks.get(taskId) };
    }
    
    // Check failed tasks
    if (this.failedTasks.has(taskId)) {
      return { found: true, ...this.failedTasks.get(taskId) };
    }
    
    return { found: false };
  }

  /**
   * Get system health status
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      components: {},
      metrics: this.getMetrics(),
      activeTasks: this.activeTasks.size
    };
    
    try {
      // Check Codegen Client
      health.components.codegenClient = await this.codegenClient.getHealth();
      
      // Check Task Processor
      health.components.taskProcessor = this.taskProcessor.getHealth();
      
      // Check PR Workflow
      health.components.prWorkflow = this.prWorkflow.getHealth();
      
      // Check Status Updater
      health.components.statusUpdater = this.statusUpdater.getHealth();
      
      // Check Webhook Handler
      if (this.webhookHandler) {
        health.components.webhookHandler = this.webhookHandler.getHealth();
      }
      
      // Check Database Prompt Generator
      if (this.databasePromptGenerator) {
        health.components.databasePromptGenerator = await this.databasePromptGenerator.getHealth();
      }
      
      // Determine overall health
      const unhealthyComponents = Object.values(health.components)
        .filter(component => component.status !== 'healthy');
      
      if (unhealthyComponents.length > 0) {
        health.status = 'degraded';
        if (unhealthyComponents.length > Object.keys(health.components).length / 2) {
          health.status = 'unhealthy';
        }
      }
      
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }
    
    return health;
  }

  /**
   * Get system metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeTasks: this.activeTasks.size,
      completedTasks: this.completedTasks.size,
      failedTasks: this.failedTasks.size,
      successRate: this.metrics.tasksProcessed > 0 
        ? this.metrics.tasksCompleted / this.metrics.tasksProcessed 
        : 0,
      errorRate: this.metrics.tasksProcessed > 0 
        ? this.metrics.tasksFailed / this.metrics.tasksProcessed 
        : 0
    };
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `codegen-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate system health during initialization
   */
  async validateSystemHealth() {
    const health = await this.getHealth();
    
    if (health.status === 'unhealthy') {
      throw new Error(`System health check failed: ${health.error || 'Multiple components unhealthy'}`);
    }
    
    console.log(`System health: ${health.status}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.isRunning) {
        await this.stop();
      }
      
      // Clear task maps
      this.activeTasks.clear();
      this.completedTasks.clear();
      this.failedTasks.clear();
      
      // Reset metrics
      this.metrics = {
        tasksProcessed: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        prsCreated: 0,
        averageProcessingTime: 0,
        totalProcessingTime: 0,
        nlpAnalysisCount: 0,
        promptGenerationCount: 0,
        errorRecoveryCount: 0
      };
      
      this.isInitialized = false;
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

export default CodegenSDKIntegration;

