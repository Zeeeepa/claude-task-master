/**
 * @fileoverview Natural Language Processor for Codegen Integration
 * @description Processes natural language task requests and prepares them for code generation
 */

import { log } from '../utils/logger.js';
import { TemplateManager } from './template_manager.js';
import { ContextManager } from '../core/context_manager.js';

/**
 * Natural Language Processor for interpreting task requirements
 */
export class NaturalLanguageProcessor {
  constructor(config = {}) {
    this.config = config;
    this.templateManager = new TemplateManager(config.templates);
    this.contextManager = new ContextManager(config.context);
    this.maxTokens = config.maxTokens || 4000;
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
    this.supportedTaskTypes = config.supportedTaskTypes || [
      'feature_implementation',
      'bug_fix',
      'code_refactor',
      'documentation',
      'testing',
      'optimization',
      'security_fix'
    ];
    
    log('debug', 'Natural Language Processor initialized', {
      maxTokens: this.maxTokens,
      confidenceThreshold: this.confidenceThreshold,
      supportedTaskTypes: this.supportedTaskTypes.length
    });
  }

  /**
   * Initialize the processor
   */
  async initialize() {
    try {
      await this.templateManager.initialize();
      await this.contextManager.initialize();
      log('info', 'Natural Language Processor initialized successfully');
    } catch (error) {
      log('error', `Failed to initialize Natural Language Processor: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a natural language task request
   * @param {Object} taskData - Raw task data from database
   * @returns {Promise<Object>} Processed task with structured requirements
   */
  async processTask(taskData) {
    try {
      log('info', `Processing task: ${taskData.id}`, {
        title: taskData.title,
        type: taskData.type
      });

      // Step 1: Analyze and classify the task
      const classification = await this._classifyTask(taskData);
      
      // Step 2: Extract structured requirements
      const requirements = await this._extractRequirements(taskData, classification);
      
      // Step 3: Identify affected components and files
      const affectedComponents = await this._identifyAffectedComponents(taskData, requirements);
      
      // Step 4: Generate context for code generation
      const context = await this._generateContext(taskData, requirements, affectedComponents);
      
      // Step 5: Select and prepare appropriate template
      const template = await this._selectTemplate(classification, requirements);
      
      // Step 6: Validate and score the processing result
      const validation = await this._validateProcessing(requirements, context);

      const processedTask = {
        id: taskData.id,
        originalTask: taskData,
        classification,
        requirements,
        affectedComponents,
        context,
        template,
        validation,
        processingMetadata: {
          processedAt: new Date().toISOString(),
          processorVersion: '1.0.0',
          confidence: validation.confidence,
          tokenCount: this._estimateTokenCount(context.prompt)
        }
      };

      log('info', `Task processed successfully: ${taskData.id}`, {
        classification: classification.type,
        confidence: validation.confidence,
        requirementCount: requirements.functional.length + requirements.technical.length
      });

      return processedTask;
    } catch (error) {
      log('error', `Failed to process task ${taskData.id}: ${error.message}`);
      throw new NLPError('TASK_PROCESSING_FAILED', `Failed to process task: ${error.message}`, error);
    }
  }

  /**
   * Batch process multiple tasks
   * @param {Array<Object>} tasks - Array of task data
   * @returns {Promise<Array<Object>>} Array of processed tasks
   */
  async batchProcessTasks(tasks) {
    const results = [];
    const errors = [];

    log('info', `Starting batch processing of ${tasks.length} tasks`);

    for (const task of tasks) {
      try {
        const processed = await this.processTask(task);
        results.push(processed);
      } catch (error) {
        log('error', `Failed to process task ${task.id} in batch: ${error.message}`);
        errors.push({
          taskId: task.id,
          error: error.message
        });
      }
    }

    log('info', `Batch processing completed`, {
      successful: results.length,
      failed: errors.length,
      total: tasks.length
    });

    return {
      successful: results,
      failed: errors,
      summary: {
        total: tasks.length,
        successful: results.length,
        failed: errors.length,
        successRate: (results.length / tasks.length) * 100
      }
    };
  }

  /**
   * Reprocess a task with updated parameters
   * @param {string} taskId - Task ID to reprocess
   * @param {Object} updates - Updated task data
   * @returns {Promise<Object>} Reprocessed task
   */
  async reprocessTask(taskId, updates) {
    try {
      log('info', `Reprocessing task: ${taskId}`);
      
      // Merge updates with original task data
      const originalTask = updates.originalTask || {};
      const updatedTask = {
        ...originalTask,
        ...updates,
        id: taskId
      };

      return await this.processTask(updatedTask);
    } catch (error) {
      log('error', `Failed to reprocess task ${taskId}: ${error.message}`);
      throw new NLPError('TASK_REPROCESSING_FAILED', `Failed to reprocess task: ${error.message}`, error);
    }
  }

  // Private methods

  /**
   * Classify the task type and complexity
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Classification result
   */
  async _classifyTask(taskData) {
    const { title, description, type } = taskData;
    const text = `${title} ${description}`.toLowerCase();

    // Keyword-based classification
    const classifications = {
      feature_implementation: {
        keywords: ['implement', 'add', 'create', 'build', 'develop', 'feature', 'functionality'],
        weight: 0
      },
      bug_fix: {
        keywords: ['fix', 'bug', 'error', 'issue', 'problem', 'broken', 'not working'],
        weight: 0
      },
      code_refactor: {
        keywords: ['refactor', 'improve', 'optimize', 'restructure', 'clean up', 'reorganize'],
        weight: 0
      },
      documentation: {
        keywords: ['document', 'docs', 'readme', 'comment', 'explain', 'guide'],
        weight: 0
      },
      testing: {
        keywords: ['test', 'testing', 'unit test', 'integration test', 'coverage'],
        weight: 0
      },
      optimization: {
        keywords: ['optimize', 'performance', 'speed', 'memory', 'efficiency', 'faster'],
        weight: 0
      },
      security_fix: {
        keywords: ['security', 'vulnerability', 'exploit', 'secure', 'auth', 'permission'],
        weight: 0
      }
    };

    // Calculate weights based on keyword matches
    for (const [taskType, config] of Object.entries(classifications)) {
      config.weight = config.keywords.reduce((weight, keyword) => {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        return weight + matches;
      }, 0);
    }

    // Find the classification with highest weight
    const bestMatch = Object.entries(classifications)
      .sort(([,a], [,b]) => b.weight - a.weight)[0];

    const [classifiedType, config] = bestMatch;
    const confidence = Math.min(config.weight / 3, 1); // Normalize confidence

    // Determine complexity based on description length and keywords
    const complexity = this._determineComplexity(taskData);

    return {
      type: classifiedType,
      confidence,
      complexity,
      originalType: type,
      keywords: config.keywords.filter(keyword => text.includes(keyword)),
      metadata: {
        textLength: text.length,
        keywordMatches: config.weight,
        allClassifications: classifications
      }
    };
  }

  /**
   * Extract structured requirements from task description
   * @param {Object} taskData - Task data
   * @param {Object} classification - Task classification
   * @returns {Promise<Object>} Extracted requirements
   */
  async _extractRequirements(taskData, classification) {
    const { description, acceptance_criteria, requirements } = taskData;
    
    // Parse existing structured requirements
    const existingRequirements = Array.isArray(requirements) ? requirements : [];
    const existingCriteria = Array.isArray(acceptance_criteria) ? acceptance_criteria : [];

    // Extract functional requirements
    const functional = [
      ...existingRequirements.filter(req => req.type === 'functional'),
      ...this._extractFunctionalRequirements(description),
      ...existingCriteria.map(criteria => ({
        type: 'functional',
        description: criteria,
        priority: 'high',
        source: 'acceptance_criteria'
      }))
    ];

    // Extract technical requirements
    const technical = [
      ...existingRequirements.filter(req => req.type === 'technical'),
      ...this._extractTechnicalRequirements(description, classification)
    ];

    // Extract constraints
    const constraints = [
      ...existingRequirements.filter(req => req.type === 'constraint'),
      ...this._extractConstraints(description)
    ];

    return {
      functional: this._deduplicateRequirements(functional),
      technical: this._deduplicateRequirements(technical),
      constraints: this._deduplicateRequirements(constraints),
      metadata: {
        extractedAt: new Date().toISOString(),
        totalCount: functional.length + technical.length + constraints.length,
        sources: ['description', 'acceptance_criteria', 'requirements']
      }
    };
  }

  /**
   * Identify affected components and files
   * @param {Object} taskData - Task data
   * @param {Object} requirements - Extracted requirements
   * @returns {Promise<Object>} Affected components
   */
  async _identifyAffectedComponents(taskData, requirements) {
    const { affected_files, metadata } = taskData;
    
    // Start with explicitly mentioned files
    const explicitFiles = Array.isArray(affected_files) ? affected_files : [];
    
    // Extract file patterns from requirements and description
    const inferredFiles = this._inferAffectedFiles(taskData, requirements);
    
    // Identify components based on file patterns
    const components = this._identifyComponents([...explicitFiles, ...inferredFiles]);
    
    // Estimate impact scope
    const impact = this._estimateImpact(components, requirements);

    return {
      files: {
        explicit: explicitFiles,
        inferred: inferredFiles,
        all: [...new Set([...explicitFiles, ...inferredFiles])]
      },
      components,
      impact,
      metadata: {
        identifiedAt: new Date().toISOString(),
        totalFiles: explicitFiles.length + inferredFiles.length,
        componentCount: components.length
      }
    };
  }

  /**
   * Generate context for code generation
   * @param {Object} taskData - Task data
   * @param {Object} requirements - Extracted requirements
   * @param {Object} affectedComponents - Affected components
   * @returns {Promise<Object>} Generated context
   */
  async _generateContext(taskData, requirements, affectedComponents) {
    // Build comprehensive context
    const context = await this.contextManager.buildContext({
      task: taskData,
      requirements,
      affectedComponents,
      includeCodebase: true,
      includeHistory: true
    });

    // Generate the main prompt
    const prompt = this._buildPrompt(taskData, requirements, affectedComponents, context);

    return {
      ...context,
      prompt,
      tokenCount: this._estimateTokenCount(prompt),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Select appropriate template based on classification
   * @param {Object} classification - Task classification
   * @param {Object} requirements - Task requirements
   * @returns {Promise<Object>} Selected template
   */
  async _selectTemplate(classification, requirements) {
    const templateName = this._mapClassificationToTemplate(classification.type);
    
    const templateVariables = {
      task_description: classification.originalType || 'General task',
      requirements: this._formatRequirements(requirements),
      repository_name: process.env.REPOSITORY_NAME || 'unknown',
      branch_name: process.env.BRANCH_NAME || 'main',
      affected_files: requirements.technical
        .filter(req => req.category === 'files')
        .map(req => req.description)
        .join(', ') || 'To be determined'
    };

    const templateContent = await this.templateManager.getTemplate(templateName, templateVariables);

    return {
      name: templateName,
      content: templateContent,
      variables: templateVariables,
      metadata: {
        selectedAt: new Date().toISOString(),
        reason: `Matched classification: ${classification.type}`
      }
    };
  }

  /**
   * Validate the processing result
   * @param {Object} requirements - Extracted requirements
   * @param {Object} context - Generated context
   * @returns {Promise<Object>} Validation result
   */
  async _validateProcessing(requirements, context) {
    const issues = [];
    let confidence = 1.0;

    // Check if requirements are comprehensive
    if (requirements.functional.length === 0) {
      issues.push('No functional requirements identified');
      confidence -= 0.2;
    }

    // Check token count
    if (context.tokenCount > this.maxTokens) {
      issues.push(`Context exceeds maximum tokens (${context.tokenCount} > ${this.maxTokens})`);
      confidence -= 0.3;
    }

    // Check if context has sufficient information
    if (!context.codebase || Object.keys(context.codebase).length === 0) {
      issues.push('Insufficient codebase context');
      confidence -= 0.2;
    }

    return {
      valid: issues.length === 0,
      confidence: Math.max(confidence, 0),
      issues,
      recommendations: this._generateRecommendations(issues),
      validatedAt: new Date().toISOString()
    };
  }

  /**
   * Determine task complexity
   * @param {Object} taskData - Task data
   * @returns {string} Complexity level
   */
  _determineComplexity(taskData) {
    const { description, estimated_hours, complexity_score } = taskData;
    
    let score = complexity_score || 5;
    
    // Adjust based on description length
    if (description && description.length > 1000) score += 2;
    if (description && description.length > 2000) score += 2;
    
    // Adjust based on estimated hours
    if (estimated_hours > 8) score += 2;
    if (estimated_hours > 16) score += 3;
    
    if (score <= 3) return 'low';
    if (score <= 6) return 'medium';
    if (score <= 8) return 'high';
    return 'very_high';
  }

  /**
   * Extract functional requirements from text
   * @param {string} text - Text to analyze
   * @returns {Array<Object>} Functional requirements
   */
  _extractFunctionalRequirements(text) {
    const requirements = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    const functionalKeywords = [
      'should', 'must', 'shall', 'will', 'needs to', 'required to',
      'user can', 'system should', 'application must'
    ];

    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (functionalKeywords.some(keyword => lowerSentence.includes(keyword))) {
        requirements.push({
          type: 'functional',
          description: sentence.trim(),
          priority: this._determinePriority(sentence),
          source: 'description'
        });
      }
    });

    return requirements;
  }

  /**
   * Extract technical requirements from text
   * @param {string} text - Text to analyze
   * @param {Object} classification - Task classification
   * @returns {Array<Object>} Technical requirements
   */
  _extractTechnicalRequirements(text, classification) {
    const requirements = [];
    const lowerText = text.toLowerCase();
    
    // Technology stack requirements
    const techPatterns = {
      'javascript': /javascript|js|node\.?js|npm|yarn/gi,
      'python': /python|pip|django|flask|fastapi/gi,
      'database': /database|sql|postgresql|mysql|mongodb/gi,
      'api': /api|rest|graphql|endpoint/gi,
      'frontend': /frontend|react|vue|angular|html|css/gi,
      'testing': /test|testing|jest|mocha|pytest/gi
    };

    Object.entries(techPatterns).forEach(([tech, pattern]) => {
      if (pattern.test(text)) {
        requirements.push({
          type: 'technical',
          category: 'technology',
          description: `Requires ${tech} technology`,
          priority: 'medium',
          source: 'inferred'
        });
      }
    });

    // Performance requirements
    if (/performance|speed|fast|optimize/i.test(text)) {
      requirements.push({
        type: 'technical',
        category: 'performance',
        description: 'Performance optimization required',
        priority: 'high',
        source: 'inferred'
      });
    }

    return requirements;
  }

  /**
   * Extract constraints from text
   * @param {string} text - Text to analyze
   * @returns {Array<Object>} Constraints
   */
  _extractConstraints(text) {
    const constraints = [];
    const lowerText = text.toLowerCase();
    
    // Time constraints
    if (/urgent|asap|deadline|by \d+/i.test(text)) {
      constraints.push({
        type: 'constraint',
        category: 'time',
        description: 'Time-sensitive task',
        priority: 'high',
        source: 'inferred'
      });
    }

    // Compatibility constraints
    if (/backward compatible|legacy|existing/i.test(text)) {
      constraints.push({
        type: 'constraint',
        category: 'compatibility',
        description: 'Must maintain backward compatibility',
        priority: 'high',
        source: 'inferred'
      });
    }

    return constraints;
  }

  /**
   * Deduplicate requirements array
   * @param {Array<Object>} requirements - Requirements to deduplicate
   * @returns {Array<Object>} Deduplicated requirements
   */
  _deduplicateRequirements(requirements) {
    const seen = new Set();
    return requirements.filter(req => {
      const key = `${req.type}:${req.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Infer affected files from task data
   * @param {Object} taskData - Task data
   * @param {Object} requirements - Requirements
   * @returns {Array<string>} Inferred file paths
   */
  _inferAffectedFiles(taskData, requirements) {
    const files = [];
    const { description, title } = taskData;
    const text = `${title} ${description}`.toLowerCase();

    // File extension patterns
    const filePatterns = {
      '.js': /\.js|javascript/gi,
      '.py': /\.py|python/gi,
      '.sql': /\.sql|database|migration/gi,
      '.md': /\.md|readme|documentation/gi,
      '.json': /\.json|config|package/gi
    };

    Object.entries(filePatterns).forEach(([ext, pattern]) => {
      if (pattern.test(text)) {
        files.push(`*${ext}`);
      }
    });

    return files;
  }

  /**
   * Identify components from file patterns
   * @param {Array<string>} files - File patterns
   * @returns {Array<Object>} Identified components
   */
  _identifyComponents(files) {
    const components = [];
    const componentMap = {
      'frontend': ['.js', '.jsx', '.ts', '.tsx', '.vue', '.html', '.css'],
      'backend': ['.py', '.js', '.java', '.go', '.rb'],
      'database': ['.sql', '.migration'],
      'config': ['.json', '.yaml', '.yml', '.env'],
      'documentation': ['.md', '.txt', '.rst']
    };

    Object.entries(componentMap).forEach(([component, extensions]) => {
      const matchingFiles = files.filter(file => 
        extensions.some(ext => file.includes(ext))
      );
      
      if (matchingFiles.length > 0) {
        components.push({
          name: component,
          files: matchingFiles,
          confidence: matchingFiles.length / files.length
        });
      }
    });

    return components;
  }

  /**
   * Estimate impact of changes
   * @param {Array<Object>} components - Affected components
   * @param {Object} requirements - Requirements
   * @returns {Object} Impact estimation
   */
  _estimateImpact(components, requirements) {
    const totalRequirements = requirements.functional.length + 
                             requirements.technical.length + 
                             requirements.constraints.length;
    
    let impactScore = 0;
    
    // Base impact from component count
    impactScore += components.length * 2;
    
    // Impact from requirement count
    impactScore += totalRequirements;
    
    // Impact from high-priority requirements
    const highPriorityCount = [
      ...requirements.functional,
      ...requirements.technical,
      ...requirements.constraints
    ].filter(req => req.priority === 'high').length;
    
    impactScore += highPriorityCount * 2;

    let level = 'low';
    if (impactScore > 10) level = 'medium';
    if (impactScore > 20) level = 'high';
    if (impactScore > 30) level = 'very_high';

    return {
      level,
      score: impactScore,
      factors: {
        componentCount: components.length,
        requirementCount: totalRequirements,
        highPriorityCount
      }
    };
  }

  /**
   * Build the main prompt for code generation
   * @param {Object} taskData - Task data
   * @param {Object} requirements - Requirements
   * @param {Object} affectedComponents - Affected components
   * @param {Object} context - Context data
   * @returns {string} Generated prompt
   */
  _buildPrompt(taskData, requirements, affectedComponents, context) {
    const sections = [
      '# Code Generation Task',
      '',
      '## Task Overview',
      `**Title:** ${taskData.title}`,
      `**Type:** ${taskData.type}`,
      `**Priority:** ${taskData.priority || 'medium'}`,
      '',
      '## Description',
      taskData.description || 'No description provided',
      '',
      '## Requirements',
      '### Functional Requirements',
      ...requirements.functional.map(req => `- ${req.description}`),
      '',
      '### Technical Requirements',
      ...requirements.technical.map(req => `- ${req.description}`),
      '',
      '### Constraints',
      ...requirements.constraints.map(req => `- ${req.description}`),
      '',
      '## Affected Components',
      ...affectedComponents.components.map(comp => 
        `- **${comp.name}**: ${comp.files.join(', ')}`
      ),
      '',
      '## Context',
      context.summary || 'No additional context available',
      '',
      '## Instructions',
      '1. Analyze the requirements carefully',
      '2. Generate clean, production-ready code',
      '3. Follow existing code patterns and conventions',
      '4. Include appropriate error handling',
      '5. Add comprehensive tests',
      '6. Update documentation as needed',
      '',
      '## Quality Standards',
      '- Code must be well-documented',
      '- Follow language-specific best practices',
      '- Ensure backward compatibility',
      '- Include proper error handling',
      '- Write comprehensive tests'
    ];

    return sections.join('\n');
  }

  /**
   * Map classification to template name
   * @param {string} classificationType - Classification type
   * @returns {string} Template name
   */
  _mapClassificationToTemplate(classificationType) {
    const mapping = {
      'feature_implementation': 'feature_implementation',
      'bug_fix': 'bug_fix',
      'code_refactor': 'code_generation',
      'documentation': 'code_generation',
      'testing': 'code_generation',
      'optimization': 'code_generation',
      'security_fix': 'bug_fix'
    };

    return mapping[classificationType] || 'code_generation';
  }

  /**
   * Format requirements for template
   * @param {Object} requirements - Requirements object
   * @returns {string} Formatted requirements
   */
  _formatRequirements(requirements) {
    const sections = [];
    
    if (requirements.functional.length > 0) {
      sections.push('**Functional Requirements:**');
      sections.push(...requirements.functional.map(req => `- ${req.description}`));
      sections.push('');
    }
    
    if (requirements.technical.length > 0) {
      sections.push('**Technical Requirements:**');
      sections.push(...requirements.technical.map(req => `- ${req.description}`));
      sections.push('');
    }
    
    if (requirements.constraints.length > 0) {
      sections.push('**Constraints:**');
      sections.push(...requirements.constraints.map(req => `- ${req.description}`));
    }

    return sections.join('\n');
  }

  /**
   * Determine requirement priority
   * @param {string} text - Requirement text
   * @returns {string} Priority level
   */
  _determinePriority(text) {
    const lowerText = text.toLowerCase();
    
    if (/must|critical|essential|required/.test(lowerText)) return 'high';
    if (/should|important|preferred/.test(lowerText)) return 'medium';
    return 'low';
  }

  /**
   * Estimate token count for text
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  _estimateTokenCount(text) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate recommendations based on issues
   * @param {Array<string>} issues - Validation issues
   * @returns {Array<string>} Recommendations
   */
  _generateRecommendations(issues) {
    const recommendations = [];
    
    issues.forEach(issue => {
      if (issue.includes('functional requirements')) {
        recommendations.push('Add more specific functional requirements to the task description');
      }
      if (issue.includes('token')) {
        recommendations.push('Simplify the task or break it into smaller subtasks');
      }
      if (issue.includes('codebase context')) {
        recommendations.push('Ensure the codebase is properly indexed and accessible');
      }
    });

    return recommendations;
  }
}

/**
 * Natural Language Processing Error class
 */
export class NLPError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.name = 'NLPError';
    this.code = code;
    this.originalError = originalError;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NLPError);
    }
  }
}

export default NaturalLanguageProcessor;

