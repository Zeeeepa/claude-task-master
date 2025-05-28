/**
 * @fileoverview Natural Language Task Parser
 * @description Convert natural language requirements into structured task definitions
 */

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { log } from '../utils/logger.js';

// Task schema for structured parsing
const TaskSchema = z.object({
  title: z.string().describe('Clear, concise task title'),
  description: z.string().describe('Detailed task description'),
  requirements: z.object({
    type: z.enum(['feature', 'bugfix', 'hotfix', 'refactor', 'experimental']).describe('Task type'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).describe('Priority level'),
    repository: z.string().optional().describe('Target repository'),
    files: z.array(z.string()).optional().describe('Files to be modified'),
    dependencies: z.array(z.string()).optional().describe('Task dependencies'),
    workflow: z.string().optional().describe('Preferred workflow type'),
    testing_required: z.boolean().optional().describe('Whether testing is required'),
    fast_track: z.boolean().optional().describe('Whether to fast-track the task')
  }),
  acceptance_criteria: z.array(z.string()).describe('Acceptance criteria for completion'),
  estimated_complexity: z.enum(['simple', 'medium', 'complex']).describe('Complexity estimation'),
  affected_components: z.array(z.string()).optional().describe('Components that will be affected'),
  risk_factors: z.array(z.string()).optional().describe('Potential risk factors')
});

// Enhanced task schema with additional metadata
const EnhancedTaskSchema = TaskSchema.extend({
  metadata: z.object({
    estimated_hours: z.number().optional().describe('Estimated hours to complete'),
    skill_requirements: z.array(z.string()).optional().describe('Required skills'),
    external_dependencies: z.array(z.string()).optional().describe('External dependencies'),
    business_impact: z.enum(['low', 'medium', 'high']).optional().describe('Business impact level'),
    technical_debt: z.boolean().optional().describe('Whether this addresses technical debt'),
    breaking_changes: z.boolean().optional().describe('Whether this introduces breaking changes')
  }).optional()
});

/**
 * Task Parser - Converts natural language to structured tasks
 */
export class TaskParser {
  constructor(config = {}) {
    this.config = {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
      temperature: 0.1,
      enableEnhancement: true,
      enableValidation: true,
      ...config
    };

    this.model = anthropic(this.config.model);
    
    // Task type patterns for quick classification
    this.typePatterns = {
      hotfix: /\b(urgent|critical|hotfix|emergency|immediate|asap|production\s+down)\b/i,
      bugfix: /\b(bug|fix|issue|problem|error|broken|not\s+working)\b/i,
      feature: /\b(feature|new|add|implement|create|build|develop)\b/i,
      refactor: /\b(refactor|cleanup|optimize|improve|restructure|reorganize)\b/i,
      experimental: /\b(experiment|prototype|poc|proof\s+of\s+concept|trial|test)\b/i
    };

    // Priority patterns
    this.priorityPatterns = {
      critical: /\b(critical|urgent|emergency|asap|immediate|production\s+down)\b/i,
      high: /\b(high|important|priority|soon|quickly)\b/i,
      medium: /\b(medium|normal|standard|regular)\b/i,
      low: /\b(low|minor|when\s+possible|nice\s+to\s+have|optional)\b/i
    };

    // Complexity patterns
    this.complexityPatterns = {
      simple: /\b(simple|easy|quick|small|minor|trivial)\b/i,
      complex: /\b(complex|difficult|large|major|significant|comprehensive)\b/i,
      medium: /\b(medium|moderate|standard|normal)\b/i
    };
  }

  /**
   * Parse natural language input into structured task
   * @param {string} input - Natural language task description
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Parsed task
   */
  async parseNaturalLanguage(input, context = {}) {
    try {
      log('info', '🔍 Parsing natural language task', {
        inputLength: input.length,
        hasContext: Object.keys(context).length > 0
      });

      // Pre-process input for better parsing
      const preprocessed = this.preprocessInput(input, context);
      
      // Generate structured object using AI
      const { object } = await generateObject({
        model: this.model,
        schema: this.config.enableEnhancement ? EnhancedTaskSchema : TaskSchema,
        prompt: this.buildParsingPrompt(preprocessed, context),
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      });

      // Post-process and validate
      const processedTask = await this.postProcessTask(object, input, context);
      
      log('info', '✅ Task parsing completed', {
        title: processedTask.title,
        type: processedTask.requirements.type,
        complexity: processedTask.estimated_complexity
      });

      return processedTask;

    } catch (error) {
      log('error', '❌ Task parsing failed', {
        error: error.message,
        input: input.substring(0, 100) + '...'
      });
      
      // Fallback to pattern-based parsing
      return this.fallbackParsing(input, context);
    }
  }

  /**
   * Enhance task requirements based on type and context
   * @param {Object} task - Base task object
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Enhanced task
   */
  async enhanceTaskRequirements(task, context = {}) {
    const enhanced = { ...task };
    
    // Type-specific enhancements
    switch (task.requirements.type) {
      case 'feature':
        enhanced.requirements.workflow = 'feature';
        enhanced.requirements.testing_required = true;
        if (!enhanced.metadata) enhanced.metadata = {};
        enhanced.metadata.estimated_hours = this.estimateHours(task, 'feature');
        break;
        
      case 'hotfix':
        enhanced.requirements.workflow = 'hotfix';
        enhanced.requirements.priority = 'critical';
        enhanced.requirements.fast_track = true;
        enhanced.requirements.testing_required = true;
        if (!enhanced.metadata) enhanced.metadata = {};
        enhanced.metadata.estimated_hours = this.estimateHours(task, 'hotfix');
        enhanced.metadata.business_impact = 'high';
        break;
        
      case 'bugfix':
        enhanced.requirements.workflow = 'bugfix';
        enhanced.requirements.testing_required = true;
        if (!enhanced.metadata) enhanced.metadata = {};
        enhanced.metadata.estimated_hours = this.estimateHours(task, 'bugfix');
        break;

      case 'refactor':
        enhanced.requirements.workflow = 'refactor';
        enhanced.requirements.testing_required = true;
        if (!enhanced.metadata) enhanced.metadata = {};
        enhanced.metadata.technical_debt = true;
        enhanced.metadata.estimated_hours = this.estimateHours(task, 'refactor');
        break;

      case 'experimental':
        enhanced.requirements.workflow = 'experimental';
        enhanced.requirements.testing_required = false;
        if (!enhanced.metadata) enhanced.metadata = {};
        enhanced.metadata.estimated_hours = this.estimateHours(task, 'experimental');
        break;
    }

    // Context-based enhancements
    if (context.repository) {
      enhanced.requirements.repository = context.repository;
    }

    if (context.assignee) {
      enhanced.assigned_to = context.assignee;
    }

    if (context.deadline) {
      enhanced.deadline = context.deadline;
      if (this.isUrgentDeadline(context.deadline)) {
        enhanced.requirements.priority = 'high';
      }
    }

    // Add risk assessment
    enhanced.risk_factors = this.assessRiskFactors(enhanced);

    log('info', '🔧 Task requirements enhanced', {
      type: enhanced.requirements.type,
      workflow: enhanced.requirements.workflow,
      priority: enhanced.requirements.priority
    });

    return enhanced;
  }

  /**
   * Validate parsed task structure
   * @param {Object} task - Task to validate
   * @returns {Object} Validation result
   */
  validateTask(task) {
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!task.title || task.title.trim().length === 0) {
      errors.push('Task title is required');
    }

    if (!task.description || task.description.trim().length === 0) {
      errors.push('Task description is required');
    }

    if (!task.requirements || !task.requirements.type) {
      errors.push('Task type is required');
    }

    if (!task.acceptance_criteria || task.acceptance_criteria.length === 0) {
      warnings.push('No acceptance criteria specified');
    }

    // Business logic validation
    if (task.requirements.type === 'hotfix' && task.requirements.priority !== 'critical') {
      warnings.push('Hotfix tasks should typically have critical priority');
    }

    if (task.estimated_complexity === 'complex' && task.metadata?.estimated_hours < 8) {
      warnings.push('Complex tasks typically require more than 8 hours');
    }

    // File validation
    if (task.requirements.files && task.requirements.files.length > 20) {
      warnings.push('Task affects many files - consider breaking into smaller tasks');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Extract task dependencies from description
   * @param {string} description - Task description
   * @returns {Array} Extracted dependencies
   */
  extractDependencies(description) {
    const dependencies = [];
    
    // Pattern matching for common dependency indicators
    const dependencyPatterns = [
      /depends?\s+on\s+([^.]+)/gi,
      /requires?\s+([^.]+)\s+to\s+be\s+completed/gi,
      /after\s+([^.]+)\s+is\s+done/gi,
      /blocked\s+by\s+([^.]+)/gi
    ];

    dependencyPatterns.forEach(pattern => {
      const matches = description.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          dependencies.push(match[1].trim());
        }
      }
    });

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Extract affected files from description
   * @param {string} description - Task description
   * @returns {Array} Extracted file paths
   */
  extractAffectedFiles(description) {
    const files = [];
    
    // Pattern matching for file paths
    const filePatterns = [
      /([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g, // Basic file paths
      /`([^`]+\.[a-zA-Z0-9]+)`/g, // Files in backticks
      /"([^"]+\.[a-zA-Z0-9]+)"/g  // Files in quotes
    ];

    filePatterns.forEach(pattern => {
      const matches = description.matchAll(pattern);
      for (const match of matches) {
        const file = match[1] || match[0];
        if (file && this.isValidFilePath(file)) {
          files.push(file);
        }
      }
    });

    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Preprocess input for better parsing
   * @param {string} input - Raw input
   * @param {Object} context - Context information
   * @returns {string} Preprocessed input
   */
  preprocessInput(input, context) {
    let processed = input.trim();
    
    // Add context information to input
    if (context.repository) {
      processed += `\n\nRepository: ${context.repository}`;
    }
    
    if (context.currentBranch) {
      processed += `\nCurrent branch: ${context.currentBranch}`;
    }
    
    if (context.relatedIssues && context.relatedIssues.length > 0) {
      processed += `\nRelated issues: ${context.relatedIssues.join(', ')}`;
    }

    return processed;
  }

  /**
   * Build parsing prompt for AI model
   * @param {string} input - Preprocessed input
   * @param {Object} context - Context information
   * @returns {string} Parsing prompt
   */
  buildParsingPrompt(input, context) {
    return `
Parse the following natural language task description into a structured format:

"${input}"

Extract and structure the following information:
- Clear, actionable title (max 100 characters)
- Detailed description of what needs to be done
- Task type (feature/bugfix/hotfix/refactor/experimental)
- Priority level (low/medium/high/critical)
- Complexity estimation (simple/medium/complex)
- Acceptance criteria (specific, measurable outcomes)
- Any mentioned files, dependencies, or components
- Risk factors or potential challenges

Guidelines:
- Be specific and actionable in the title and description
- Infer task type from context clues and keywords
- Set priority based on urgency indicators
- Estimate complexity based on scope and technical requirements
- Create clear, testable acceptance criteria
- Identify potential risks or blockers

${context.repository ? `Target repository: ${context.repository}` : ''}
${context.currentUser ? `Assigned to: ${context.currentUser}` : ''}

Provide a comprehensive but concise breakdown that enables effective task execution.
    `.trim();
  }

  /**
   * Post-process parsed task
   * @param {Object} task - Parsed task
   * @param {string} originalInput - Original input
   * @param {Object} context - Context information
   * @returns {Promise<Object>} Post-processed task
   */
  async postProcessTask(task, originalInput, context) {
    // Extract additional information using pattern matching
    if (!task.requirements.files || task.requirements.files.length === 0) {
      task.requirements.files = this.extractAffectedFiles(originalInput);
    }

    if (!task.requirements.dependencies || task.requirements.dependencies.length === 0) {
      task.requirements.dependencies = this.extractDependencies(originalInput);
    }

    // Enhance based on type
    const enhanced = await this.enhanceTaskRequirements(task, context);

    // Validate the result
    if (this.config.enableValidation) {
      const validation = this.validateTask(enhanced);
      if (!validation.valid) {
        log('warn', '⚠️ Task validation issues', {
          errors: validation.errors,
          warnings: validation.warnings
        });
      }
      enhanced.validation = validation;
    }

    return enhanced;
  }

  /**
   * Fallback parsing using pattern matching
   * @param {string} input - Input text
   * @param {Object} context - Context information
   * @returns {Object} Basic parsed task
   */
  fallbackParsing(input, context) {
    log('info', '🔄 Using fallback parsing method');

    const task = {
      title: this.extractTitle(input),
      description: input,
      requirements: {
        type: this.classifyTaskType(input),
        priority: this.classifyPriority(input),
        files: this.extractAffectedFiles(input),
        dependencies: this.extractDependencies(input)
      },
      acceptance_criteria: this.extractAcceptanceCriteria(input),
      estimated_complexity: this.classifyComplexity(input)
    };

    return this.enhanceTaskRequirements(task, context);
  }

  /**
   * Extract title from input
   * @param {string} input - Input text
   * @returns {string} Extracted title
   */
  extractTitle(input) {
    // Take first sentence or first 100 characters
    const firstSentence = input.split(/[.!?]/)[0];
    return firstSentence.length > 100 
      ? firstSentence.substring(0, 97) + '...'
      : firstSentence;
  }

  /**
   * Classify task type using patterns
   * @param {string} input - Input text
   * @returns {string} Task type
   */
  classifyTaskType(input) {
    for (const [type, pattern] of Object.entries(this.typePatterns)) {
      if (pattern.test(input)) {
        return type;
      }
    }
    return 'feature'; // Default
  }

  /**
   * Classify priority using patterns
   * @param {string} input - Input text
   * @returns {string} Priority level
   */
  classifyPriority(input) {
    for (const [priority, pattern] of Object.entries(this.priorityPatterns)) {
      if (pattern.test(input)) {
        return priority;
      }
    }
    return 'medium'; // Default
  }

  /**
   * Classify complexity using patterns
   * @param {string} input - Input text
   * @returns {string} Complexity level
   */
  classifyComplexity(input) {
    for (const [complexity, pattern] of Object.entries(this.complexityPatterns)) {
      if (pattern.test(input)) {
        return complexity;
      }
    }
    return 'medium'; // Default
  }

  /**
   * Extract acceptance criteria from input
   * @param {string} input - Input text
   * @returns {Array} Acceptance criteria
   */
  extractAcceptanceCriteria(input) {
    const criteria = [];
    
    // Look for numbered lists, bullet points, or "should" statements
    const patterns = [
      /(?:^|\n)\s*[-*]\s*(.+)/gm,
      /(?:^|\n)\s*\d+\.\s*(.+)/gm,
      /should\s+(.+?)(?:\.|$)/gi
    ];

    patterns.forEach(pattern => {
      const matches = input.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 10) {
          criteria.push(match[1].trim());
        }
      }
    });

    return criteria.length > 0 ? criteria : ['Task should be completed successfully'];
  }

  /**
   * Estimate hours for task completion
   * @param {Object} task - Task object
   * @param {string} type - Task type
   * @returns {number} Estimated hours
   */
  estimateHours(task, type) {
    const baseHours = {
      hotfix: 2,
      bugfix: 4,
      feature: 8,
      refactor: 12,
      experimental: 6
    };

    const complexityMultiplier = {
      simple: 0.5,
      medium: 1.0,
      complex: 2.0
    };

    const base = baseHours[type] || 8;
    const multiplier = complexityMultiplier[task.estimated_complexity] || 1.0;
    
    return Math.round(base * multiplier);
  }

  /**
   * Assess risk factors for a task
   * @param {Object} task - Task object
   * @returns {Array} Risk factors
   */
  assessRiskFactors(task) {
    const risks = [];
    
    if (task.estimated_complexity === 'complex') {
      risks.push('high_complexity');
    }
    
    if (task.requirements.files && task.requirements.files.length > 10) {
      risks.push('many_files_affected');
    }
    
    if (task.requirements.type === 'hotfix') {
      risks.push('urgent_deployment');
    }
    
    if (task.requirements.dependencies && task.requirements.dependencies.length > 3) {
      risks.push('multiple_dependencies');
    }

    if (task.metadata?.breaking_changes) {
      risks.push('breaking_changes');
    }
    
    return risks;
  }

  /**
   * Check if deadline is urgent
   * @param {Date|string} deadline - Deadline
   * @returns {boolean} True if urgent
   */
  isUrgentDeadline(deadline) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const hoursUntilDeadline = (deadlineDate - now) / (1000 * 60 * 60);
    
    return hoursUntilDeadline < 24; // Less than 24 hours
  }

  /**
   * Validate file path format
   * @param {string} path - File path
   * @returns {boolean} True if valid
   */
  isValidFilePath(path) {
    // Basic validation for file paths
    return /^[a-zA-Z0-9_.\-\/]+$/.test(path) && 
           path.includes('.') && 
           path.length < 200;
  }

  /**
   * Get parsing statistics
   * @returns {Object} Parsing statistics
   */
  getStatistics() {
    return {
      totalParsed: this.stats?.totalParsed || 0,
      successfulParsed: this.stats?.successfulParsed || 0,
      fallbackUsed: this.stats?.fallbackUsed || 0,
      averageParsingTime: this.stats?.averageParsingTime || 0
    };
  }
}

