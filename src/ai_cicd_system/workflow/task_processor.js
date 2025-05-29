/**
 * @fileoverview Enhanced Task Processing with Codegen
 * @description Advanced task processing engine with Codegen integration
 */

import { log } from '../utils/simple_logger.js';
import { TaskAnalyzer } from '../integrations/codegen/task_analyzer.js';
import { PromptGenerator } from '../integrations/codegen/prompt_generator.js';
import { CodegenClient } from '../integrations/codegen/client.js';
import { ContextManager } from '../integrations/codegen/context_manager.js';
import { RequirementExtractor } from '../nlp/requirement_extractor.js';
import { CodeIntentAnalyzer } from '../nlp/code_intent_analyzer.js';
import { TemplateEngine } from '../nlp/template_engine.js';

/**
 * Enhanced Task Processor with Codegen integration
 */
export class TaskProcessor {
  constructor(config = {}) {
    this.config = {
      enableCodegenIntegration: config.enableCodegenIntegration !== false,
      enableNLPAnalysis: config.enableNLPAnalysis !== false,
      enableTemplateGeneration: config.enableTemplateGeneration !== false,
      maxRetries: config.maxRetries || 3,
      timeoutMs: config.timeoutMs || 300000, // 5 minutes
      enableCaching: config.enableCaching !== false
    };
    
    // Initialize components
    this.taskAnalyzer = new TaskAnalyzer(config.taskAnalyzer);
    this.promptGenerator = new PromptGenerator(config.promptGenerator);
    this.codegenClient = new CodegenClient(config.codegen);
    this.contextManager = new ContextManager(config.contextManager);
    this.requirementExtractor = new RequirementExtractor(config.requirementExtractor);
    this.codeIntentAnalyzer = new CodeIntentAnalyzer(config.codeIntentAnalyzer);
    this.templateEngine = new TemplateEngine(config.templateEngine);
    
    // Processing cache
    this.processingCache = new Map();
    this.isInitialized = false;
    
    log('debug', 'TaskProcessor initialized', { config: this.config });
  }

  /**
   * Initialize the task processor
   */
  async initialize() {
    try {
      log('info', 'Initializing TaskProcessor...');
      
      if (this.config.enableCodegenIntegration) {
        await this.codegenClient.initialize();
      }
      
      this.isInitialized = true;
      log('info', 'TaskProcessor initialized successfully');
      
    } catch (error) {
      log('error', `TaskProcessor initialization failed: ${error.message}`);
      throw new Error(`TaskProcessor initialization failed: ${error.message}`);
    }
  }

  /**
   * Process a natural language task
   * @param {Object} task - Task to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processTask(task, options = {}) {
    this._ensureInitialized();
    
    const taskId = task.id || this._generateTaskId();
    const startTime = Date.now();
    
    try {
      log('info', `Processing task ${taskId}: ${task.description.substring(0, 100)}...`);
      
      // Check cache if enabled
      if (this.config.enableCaching) {
        const cached = this._getCachedResult(task);
        if (cached) {
          log('info', `Using cached result for task ${taskId}`);
          return cached;
        }
      }
      
      const result = {
        taskId,
        originalTask: task,
        startTime: new Date(startTime).toISOString(),
        status: 'processing',
        steps: [],
        analysis: null,
        codegenResult: null,
        template: null,
        metadata: {
          processingTimeMs: 0,
          retryCount: 0,
          cacheHit: false
        }
      };
      
      // Step 1: Analyze task
      result.analysis = await this._analyzeTask(task, options);
      result.steps.push({ step: 'analysis', completed: true, timestamp: new Date().toISOString() });
      
      // Step 2: Generate template if enabled
      if (this.config.enableTemplateGeneration) {
        result.template = await this._generateTemplate(result.analysis, options);
        result.steps.push({ step: 'template_generation', completed: true, timestamp: new Date().toISOString() });
      }
      
      // Step 3: Process with Codegen if enabled
      if (this.config.enableCodegenIntegration) {
        result.codegenResult = await this._processWithCodegen(result.analysis, result.template, options);
        result.steps.push({ step: 'codegen_processing', completed: true, timestamp: new Date().toISOString() });
      }
      
      // Step 4: Finalize result
      result.status = 'completed';
      result.metadata.processingTimeMs = Date.now() - startTime;
      
      // Cache result if enabled
      if (this.config.enableCaching) {
        this._cacheResult(task, result);
      }
      
      log('info', `Task ${taskId} processed successfully`, {
        processingTime: result.metadata.processingTimeMs,
        steps: result.steps.length,
        hasCodegenResult: !!result.codegenResult
      });
      
      return result;
      
    } catch (error) {
      log('error', `Task ${taskId} processing failed: ${error.message}`);
      
      return {
        taskId,
        originalTask: task,
        status: 'failed',
        error: {
          message: error.message,
          type: error.constructor.name,
          timestamp: new Date().toISOString()
        },
        metadata: {
          processingTimeMs: Date.now() - startTime,
          retryCount: 0
        }
      };
    }
  }

  /**
   * Process multiple tasks in batch
   * @param {Array} tasks - Tasks to process
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Processing results
   */
  async processBatch(tasks, options = {}) {
    this._ensureInitialized();
    
    log('info', `Processing batch of ${tasks.length} tasks`);
    
    const batchOptions = {
      ...options,
      concurrent: options.concurrent || 3,
      failFast: options.failFast || false
    };
    
    const results = [];
    const batches = this._createBatches(tasks, batchOptions.concurrent);
    
    for (const batch of batches) {
      const batchPromises = batch.map(task => 
        this.processTask(task, options).catch(error => ({
          taskId: task.id || 'unknown',
          status: 'failed',
          error: { message: error.message }
        }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Check for failures if failFast is enabled
      if (batchOptions.failFast && batchResults.some(r => r.status === 'failed')) {
        log('warning', 'Batch processing stopped due to failure (failFast enabled)');
        break;
      }
    }
    
    log('info', `Batch processing completed`, {
      total: tasks.length,
      successful: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length
    });
    
    return results;
  }

  /**
   * Analyze task using multiple analysis engines
   * @param {Object} task - Task to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   * @private
   */
  async _analyzeTask(task, options) {
    log('debug', `Analyzing task: ${task.description.substring(0, 100)}...`);
    
    const analysis = {
      timestamp: new Date().toISOString(),
      description: task.description,
      context: options.context || {}
    };
    
    // Basic task analysis
    analysis.basic = await this.taskAnalyzer.analyzeTask(task.description, options.context);
    
    // NLP analysis if enabled
    if (this.config.enableNLPAnalysis) {
      // Requirement extraction
      analysis.requirements = await this.requirementExtractor.extractRequirements(
        task.description, 
        options.context
      );
      
      // Code intent analysis
      analysis.intent = await this.codeIntentAnalyzer.analyzeIntent(
        task.description, 
        options.context
      );
    }
    
    // Build context
    analysis.context = await this.contextManager.buildContext(analysis.basic, options);
    
    log('debug', 'Task analysis completed', {
      hasRequirements: !!analysis.requirements,
      hasIntent: !!analysis.intent,
      contextSize: analysis.context.metadata.contextSize
    });
    
    return analysis;
  }

  /**
   * Generate template based on analysis
   * @param {Object} analysis - Task analysis
   * @param {Object} options - Template options
   * @returns {Promise<Object>} Template result
   * @private
   */
  async _generateTemplate(analysis, options) {
    if (!analysis.intent) {
      log('warning', 'Skipping template generation - no intent analysis available');
      return null;
    }
    
    log('debug', 'Generating template...');
    
    const template = await this.templateEngine.generateTemplate(
      analysis.intent,
      {
        language: options.language,
        framework: options.framework,
        ...options.templateOptions
      }
    );
    
    log('debug', 'Template generated successfully', {
      type: template.type,
      language: template.language,
      files: template.files.length
    });
    
    return template;
  }

  /**
   * Process with Codegen API
   * @param {Object} analysis - Task analysis
   * @param {Object} template - Generated template
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Codegen result
   * @private
   */
  async _processWithCodegen(analysis, template, options) {
    log('debug', 'Processing with Codegen...');
    
    // Generate optimized prompt
    const prompt = await this.promptGenerator.generatePrompt(analysis.basic, {
      context: analysis.context,
      template: template,
      ...options.promptOptions
    });
    
    // Create Codegen request
    const codegenRequest = {
      description: prompt.content,
      repository: options.repository,
      context: {
        analysis: analysis,
        template: template,
        prompt: prompt
      }
    };
    
    // Execute Codegen request with retries
    let lastError;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        log('debug', `Codegen attempt ${attempt}/${this.config.maxRetries}`);
        
        const result = await this.codegenClient.createPR(codegenRequest);
        
        if (result.success) {
          log('debug', 'Codegen processing successful', {
            taskId: result.taskId,
            prUrl: result.prUrl
          });
          
          return {
            ...result,
            prompt: prompt,
            attempt: attempt,
            processingTime: result.metadata?.responseTime
          };
        } else {
          lastError = new Error(result.error?.message || 'Codegen request failed');
        }
        
      } catch (error) {
        lastError = error;
        log('warning', `Codegen attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.config.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          log('debug', `Retrying in ${delay}ms...`);
          await this._sleep(delay);
        }
      }
    }
    
    throw lastError || new Error('Codegen processing failed after all retries');
  }

  /**
   * Get processing statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      isInitialized: this.isInitialized,
      cacheSize: this.processingCache.size,
      components: {
        taskAnalyzer: this.taskAnalyzer.constructor.name,
        promptGenerator: this.promptGenerator.constructor.name,
        codegenClient: this.codegenClient.getStatistics(),
        contextManager: this.contextManager.getCacheStats(),
        requirementExtractor: this.requirementExtractor.constructor.name,
        codeIntentAnalyzer: this.codeIntentAnalyzer.constructor.name,
        templateEngine: this.templateEngine.constructor.name
      },
      config: this.config
    };
  }

  /**
   * Get health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {}
    };
    
    try {
      // Check Codegen client health
      if (this.config.enableCodegenIntegration) {
        health.components.codegenClient = await this.codegenClient.getHealth();
        if (!health.components.codegenClient.healthy) {
          health.status = 'degraded';
        }
      }
      
      // Check other components
      health.components.taskProcessor = {
        initialized: this.isInitialized,
        cacheSize: this.processingCache.size
      };
      
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }
    
    return health;
  }

  /**
   * Shutdown the task processor
   */
  async shutdown() {
    log('info', 'Shutting down TaskProcessor...');
    
    if (this.config.enableCodegenIntegration) {
      await this.codegenClient.shutdown();
    }
    
    this.processingCache.clear();
    this.contextManager.clearCache();
    this.isInitialized = false;
    
    log('info', 'TaskProcessor shutdown complete');
  }

  // Private helper methods

  /**
   * Ensure processor is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('TaskProcessor must be initialized before use');
    }
  }

  /**
   * Generate unique task ID
   * @returns {string} Task ID
   * @private
   */
  _generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get cached result
   * @param {Object} task - Task
   * @returns {Object|null} Cached result
   * @private
   */
  _getCachedResult(task) {
    const cacheKey = this._generateCacheKey(task);
    return this.processingCache.get(cacheKey);
  }

  /**
   * Cache result
   * @param {Object} task - Task
   * @param {Object} result - Result to cache
   * @private
   */
  _cacheResult(task, result) {
    const cacheKey = this._generateCacheKey(task);
    
    // Add cache metadata
    result.metadata.cacheHit = false;
    result.metadata.cachedAt = new Date().toISOString();
    
    this.processingCache.set(cacheKey, result);
    
    // Limit cache size
    if (this.processingCache.size > 100) {
      const firstKey = this.processingCache.keys().next().value;
      this.processingCache.delete(firstKey);
    }
  }

  /**
   * Generate cache key
   * @param {Object} task - Task
   * @returns {string} Cache key
   * @private
   */
  _generateCacheKey(task) {
    const content = JSON.stringify({
      description: task.description,
      type: task.type,
      priority: task.priority
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `task_${Math.abs(hash)}`;
  }

  /**
   * Create batches from tasks array
   * @param {Array} tasks - Tasks
   * @param {number} batchSize - Batch size
   * @returns {Array} Batches
   * @private
   */
  _createBatches(tasks, batchSize) {
    const batches = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Sleep promise
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear processing cache
   */
  clearCache() {
    this.processingCache.clear();
    this.contextManager.clearCache();
    log('debug', 'Processing cache cleared');
  }

  /**
   * Process task with timeout
   * @param {Object} task - Task to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processTaskWithTimeout(task, options = {}) {
    const timeout = options.timeout || this.config.timeoutMs;
    
    return Promise.race([
      this.processTask(task, options),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Task processing timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Validate task before processing
   * @param {Object} task - Task to validate
   * @returns {boolean} Validation result
   */
  validateTask(task) {
    if (!task) {
      throw new Error('Task is required');
    }
    
    if (!task.description || typeof task.description !== 'string') {
      throw new Error('Task description is required and must be a string');
    }
    
    if (task.description.length < 10) {
      throw new Error('Task description must be at least 10 characters long');
    }
    
    if (task.description.length > 5000) {
      throw new Error('Task description must be less than 5000 characters');
    }
    
    return true;
  }
}

export default TaskProcessor;

