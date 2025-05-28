/**
 * @fileoverview Codegen Integration Module
 * @description Main entry point for the Codegen Natural Language Processing & PR Generation system
 */

import { log } from '../utils/logger.js';
import { NaturalLanguageProcessor } from './natural_language_processor.js';
import { BranchManager } from './branch_manager.js';
import { CodeQualityValidator } from './code_quality_validator.js';
import { TemplateManager } from './template_manager.js';
import { PRGenerator } from './pr_generator.js';

/**
 * Codegen Integration System
 * Main orchestrator for natural language processing and PR generation
 */
export class CodegenIntegrationSystem {
  constructor(config = {}) {
    this.config = config;
    this.initialized = false;
    this.components = {};
    this.metrics = {
      tasksProcessed: 0,
      prsGenerated: 0,
      qualityScore: 0,
      successRate: 0,
      startTime: new Date()
    };
    
    log('debug', 'Codegen Integration System created', {
      configKeys: Object.keys(config)
    });
  }

  /**
   * Initialize the entire system
   */
  async initialize() {
    try {
      log('info', 'Initializing Codegen Integration System...');

      // Initialize core components
      this.components.templateManager = new TemplateManager(this.config.templates);
      this.components.nlpProcessor = new NaturalLanguageProcessor(this.config.nlp);
      this.components.branchManager = new BranchManager(this.config.branch);
      this.components.qualityValidator = new CodeQualityValidator(this.config.quality);
      this.components.prGenerator = new PRGenerator({
        ...this.config.prGenerator,
        nlp: this.config.nlp,
        branch: this.config.branch,
        quality: this.config.quality,
        templates: this.config.templates,
        codegen: this.config.codegen
      });

      // Initialize all components
      await Promise.all([
        this.components.templateManager.initialize(),
        this.components.nlpProcessor.initialize(),
        this.components.branchManager.initialize(),
        this.components.qualityValidator.initialize(),
        this.components.prGenerator.initialize()
      ]);

      this.initialized = true;
      
      log('info', 'Codegen Integration System initialized successfully');
      
      return {
        success: true,
        components: Object.keys(this.components),
        initializedAt: new Date().toISOString()
      };
    } catch (error) {
      log('error', `Failed to initialize Codegen Integration System: ${error.message}`);
      throw new CodegenSystemError('INITIALIZATION_FAILED', 
        `System initialization failed: ${error.message}`, error);
    }
  }

  /**
   * Process a task and generate a PR
   * @param {Object} taskData - Task data from database
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processTask(taskData, options = {}) {
    this._ensureInitialized();
    
    try {
      log('info', `Processing task: ${taskData.id}`, {
        title: taskData.title,
        type: taskData.type
      });

      const startTime = Date.now();
      
      // Generate PR using the PR Generator
      const result = await this.components.prGenerator.generatePR(taskData, options);
      
      // Update metrics
      this._updateMetrics(result, Date.now() - startTime);
      
      log('info', `Task processed successfully: ${taskData.id}`, {
        prUrl: result.pr?.url,
        workflowId: result.workflowId,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        taskId: taskData.id,
        result,
        processingTime: Date.now() - startTime,
        metrics: this.getMetrics()
      };
    } catch (error) {
      log('error', `Failed to process task ${taskData.id}: ${error.message}`);
      this._updateMetrics({ success: false }, 0);
      throw error;
    }
  }

  /**
   * Process multiple tasks in batch
   * @param {Array<Object>} tasks - Array of task data
   * @param {Object} options - Batch processing options
   * @returns {Promise<Object>} Batch processing result
   */
  async batchProcessTasks(tasks, options = {}) {
    this._ensureInitialized();
    
    try {
      log('info', `Starting batch processing of ${tasks.length} tasks`);

      const batchStartTime = Date.now();
      const results = [];
      const errors = [];
      const maxConcurrency = options.maxConcurrency || 3;
      
      // Process tasks in batches to avoid overwhelming the system
      for (let i = 0; i < tasks.length; i += maxConcurrency) {
        const batch = tasks.slice(i, i + maxConcurrency);
        const batchPromises = batch.map(async (task) => {
          try {
            const result = await this.processTask(task, options);
            results.push(result);
          } catch (error) {
            errors.push({
              taskId: task.id,
              error: error.message
            });
          }
        });
        
        await Promise.all(batchPromises);
      }

      const batchResult = {
        success: true,
        totalTasks: tasks.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
        processingTime: Date.now() - batchStartTime,
        metrics: this.getMetrics()
      };

      log('info', `Batch processing completed`, {
        totalTasks: tasks.length,
        successful: results.length,
        failed: errors.length,
        processingTime: batchResult.processingTime
      });

      return batchResult;
    } catch (error) {
      log('error', `Batch processing failed: ${error.message}`);
      throw new CodegenSystemError('BATCH_PROCESSING_FAILED', 
        `Batch processing failed: ${error.message}`, error);
    }
  }

  /**
   * Get system health status
   * @returns {Object} Health status
   */
  async getHealthStatus() {
    const health = {
      status: 'healthy',
      initialized: this.initialized,
      components: {},
      metrics: this.getMetrics(),
      uptime: Date.now() - this.metrics.startTime.getTime(),
      timestamp: new Date().toISOString()
    };

    if (!this.initialized) {
      health.status = 'not_initialized';
      return health;
    }

    // Check component health
    try {
      for (const [name, component] of Object.entries(this.components)) {
        if (typeof component.getHealth === 'function') {
          health.components[name] = await component.getHealth();
        } else {
          health.components[name] = { status: 'unknown' };
        }
      }
    } catch (error) {
      health.status = 'degraded';
      health.error = error.message;
    }

    // Determine overall health
    const componentStatuses = Object.values(health.components).map(c => c.status);
    if (componentStatuses.some(status => status === 'unhealthy')) {
      health.status = 'unhealthy';
    } else if (componentStatuses.some(status => status === 'degraded')) {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Get system metrics
   * @returns {Object} System metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime.getTime(),
      averageProcessingTime: this.metrics.tasksProcessed > 0 ? 
        this.metrics.totalProcessingTime / this.metrics.tasksProcessed : 0
    };
  }

  /**
   * Get component by name
   * @param {string} componentName - Name of the component
   * @returns {Object} Component instance
   */
  getComponent(componentName) {
    this._ensureInitialized();
    
    const component = this.components[componentName];
    if (!component) {
      throw new CodegenSystemError('COMPONENT_NOT_FOUND', 
        `Component ${componentName} not found`);
    }
    
    return component;
  }

  /**
   * Shutdown the system gracefully
   */
  async shutdown() {
    try {
      log('info', 'Shutting down Codegen Integration System...');

      // Shutdown components that support it
      const shutdownPromises = [];
      for (const [name, component] of Object.entries(this.components)) {
        if (typeof component.shutdown === 'function') {
          shutdownPromises.push(
            component.shutdown().catch(error => 
              log('warning', `Failed to shutdown ${name}: ${error.message}`)
            )
          );
        }
      }

      await Promise.all(shutdownPromises);
      
      this.initialized = false;
      
      log('info', 'Codegen Integration System shutdown completed');
    } catch (error) {
      log('error', `Error during shutdown: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate system configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result
   */
  static validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Required configuration sections
    const requiredSections = ['nlp', 'branch', 'quality', 'templates', 'codegen'];
    
    for (const section of requiredSections) {
      if (!config[section]) {
        errors.push(`Missing required configuration section: ${section}`);
      }
    }

    // Validate NLP configuration
    if (config.nlp) {
      if (!config.nlp.maxTokens || config.nlp.maxTokens < 1000) {
        warnings.push('NLP maxTokens should be at least 1000 for optimal performance');
      }
      
      if (!config.nlp.confidenceThreshold || config.nlp.confidenceThreshold < 0.5) {
        warnings.push('NLP confidenceThreshold should be at least 0.5');
      }
    }

    // Validate quality configuration
    if (config.quality) {
      if (!config.quality.qualityThreshold || config.quality.qualityThreshold < 0.6) {
        warnings.push('Quality threshold should be at least 0.6 for production use');
      }
    }

    // Validate branch configuration
    if (config.branch) {
      if (!config.branch.baseBranch) {
        errors.push('Branch baseBranch is required');
      }
      
      if (!config.branch.branchPrefix) {
        warnings.push('Branch prefix not specified, using default');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create system with default configuration
   * @param {Object} overrides - Configuration overrides
   * @returns {CodegenIntegrationSystem} System instance
   */
  static createWithDefaults(overrides = {}) {
    const defaultConfig = {
      nlp: {
        maxTokens: 4000,
        confidenceThreshold: 0.7,
        supportedTaskTypes: [
          'feature_implementation',
          'bug_fix',
          'code_refactor',
          'documentation',
          'testing',
          'optimization',
          'security_fix'
        ]
      },
      branch: {
        baseBranch: 'main',
        branchPrefix: 'codegen',
        maxConcurrentBranches: 10,
        cleanupOldBranches: true,
        branchRetentionDays: 7
      },
      quality: {
        qualityThreshold: 0.8,
        enableLinting: true,
        enableTesting: true,
        enableSecurity: true,
        enablePerformance: true
      },
      templates: {
        templatesDir: './templates/prompt_instructions',
        cacheEnabled: true,
        maxCacheSize: 100
      },
      codegen: {
        baseURL: 'https://api.codegen.sh',
        timeout: 30000,
        retries: 3
      },
      prGenerator: {
        maxRetries: 3,
        qualityThreshold: 0.8,
        enableQualityGates: true,
        enableAutoMerge: false
      }
    };

    const mergedConfig = this._deepMerge(defaultConfig, overrides);
    
    // Validate configuration
    const validation = this.validateConfig(mergedConfig);
    if (!validation.valid) {
      throw new CodegenSystemError('INVALID_CONFIG', 
        `Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      log('warning', 'Configuration warnings:', validation.warnings);
    }

    return new CodegenIntegrationSystem(mergedConfig);
  }

  // Private methods

  /**
   * Ensure system is initialized
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new CodegenSystemError('NOT_INITIALIZED', 
        'System must be initialized before use');
    }
  }

  /**
   * Update system metrics
   */
  _updateMetrics(result, processingTime) {
    this.metrics.tasksProcessed++;
    this.metrics.totalProcessingTime = (this.metrics.totalProcessingTime || 0) + processingTime;
    
    if (result.success) {
      this.metrics.prsGenerated++;
    }
    
    // Update success rate
    this.metrics.successRate = this.metrics.prsGenerated / this.metrics.tasksProcessed;
    
    // Update quality score (if available)
    if (result.workflow && result.workflow.qualityResult) {
      const currentQuality = result.workflow.qualityResult.overall.score;
      this.metrics.qualityScore = (this.metrics.qualityScore + currentQuality) / 2;
    }
  }

  /**
   * Deep merge configuration objects
   */
  static _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

/**
 * Codegen System Error class
 */
export class CodegenSystemError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.name = 'CodegenSystemError';
    this.code = code;
    this.originalError = originalError;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CodegenSystemError);
    }
  }
}

// Export individual components for direct use
export {
  NaturalLanguageProcessor,
  BranchManager,
  CodeQualityValidator,
  TemplateManager,
  PRGenerator
};

// Export default system
export default CodegenIntegrationSystem;

