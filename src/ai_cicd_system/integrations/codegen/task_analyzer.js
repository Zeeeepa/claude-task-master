/**
 * @fileoverview Task Requirement Analysis
 * @description Intelligent analysis of natural language tasks for Codegen integration
 */

import { log } from '../../utils/logger.js';

/**
 * Task Analyzer for extracting requirements and coding intent
 */
export class TaskAnalyzer {
  constructor(config = {}) {
    this.config = {
      maxComplexityScore: config.maxComplexityScore || 100,
      enableDetailedAnalysis: config.enableDetailedAnalysis !== false,
      supportedLanguages: config.supportedLanguages || [
        'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
      ],
      supportedFrameworks: config.supportedFrameworks || [
        'react', 'vue', 'angular', 'express', 'fastapi', 'django', 'spring', 'rails'
      ]
    };
    
    // Task complexity patterns
    this.complexityPatterns = {
      simple: [
        /add.*function/i, /create.*component/i, /fix.*bug/i, /update.*style/i,
        /change.*text/i, /modify.*variable/i, /rename.*file/i
      ],
      medium: [
        /implement.*feature/i, /add.*authentication/i, /create.*api/i, /integrate.*service/i,
        /refactor.*code/i, /optimize.*performance/i, /add.*validation/i
      ],
      complex: [
        /migrate.*database/i, /redesign.*architecture/i, /implement.*microservice/i,
        /add.*machine.*learning/i, /create.*distributed.*system/i, /implement.*security/i
      ]
    };
    
    // Intent patterns
    this.intentPatterns = {
      create: [/create/i, /add/i, /implement/i, /build/i, /generate/i],
      modify: [/update/i, /change/i, /modify/i, /edit/i, /alter/i],
      fix: [/fix/i, /repair/i, /resolve/i, /debug/i, /correct/i],
      delete: [/remove/i, /delete/i, /drop/i, /eliminate/i],
      refactor: [/refactor/i, /restructure/i, /reorganize/i, /optimize/i]
    };
    
    log('debug', 'TaskAnalyzer initialized', { config: this.config });
  }

  /**
   * Analyze a natural language task description
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeTask(description, context = {}) {
    try {
      log('info', `Analyzing task: ${description.substring(0, 100)}...`);
      
      const analysis = {
        originalDescription: description,
        context,
        timestamp: new Date().toISOString(),
        
        // Core analysis
        intent: this._analyzeIntent(description),
        complexity: this._analyzeComplexity(description),
        requirements: this._extractRequirements(description),
        
        // Technical analysis
        technologies: this._identifyTechnologies(description, context),
        fileTypes: this._identifyFileTypes(description, context),
        dependencies: this._identifyDependencies(description, context),
        
        // Scope analysis
        scope: this._analyzeScope(description),
        estimatedEffort: this._estimateEffort(description),
        riskFactors: this._identifyRiskFactors(description),
        
        // Codegen-specific
        codegenPrompt: this._generateCodegenPrompt(description, context),
        priority: this._calculatePriority(description, context)
      };
      
      // Add detailed analysis if enabled
      if (this.config.enableDetailedAnalysis) {
        analysis.detailed = await this._performDetailedAnalysis(description, context);
      }
      
      log('info', `Task analysis completed`, {
        intent: analysis.intent.primary,
        complexity: analysis.complexity.level,
        estimatedEffort: analysis.estimatedEffort
      });
      
      return analysis;
      
    } catch (error) {
      log('error', `Task analysis failed: ${error.message}`);
      throw new Error(`Task analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze task intent
   * @param {string} description - Task description
   * @returns {Object} Intent analysis
   * @private
   */
  _analyzeIntent(description) {
    const intents = {};
    let primaryIntent = 'unknown';
    let confidence = 0;
    
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      const matches = patterns.filter(pattern => pattern.test(description)).length;
      const intentConfidence = matches / patterns.length;
      
      intents[intent] = {
        confidence: intentConfidence,
        matches: matches
      };
      
      if (intentConfidence > confidence) {
        confidence = intentConfidence;
        primaryIntent = intent;
      }
    }
    
    return {
      primary: primaryIntent,
      confidence,
      all: intents,
      description: this._getIntentDescription(primaryIntent)
    };
  }

  /**
   * Analyze task complexity
   * @param {string} description - Task description
   * @returns {Object} Complexity analysis
   * @private
   */
  _analyzeComplexity(description) {
    let level = 'simple';
    let score = 10;
    const factors = [];
    
    // Check complexity patterns
    for (const [complexityLevel, patterns] of Object.entries(this.complexityPatterns)) {
      const matches = patterns.filter(pattern => pattern.test(description));
      if (matches.length > 0) {
        level = complexityLevel;
        factors.push(...matches.map(m => m.source));
      }
    }
    
    // Calculate score based on various factors
    const words = description.split(/\s+/).length;
    const sentences = description.split(/[.!?]+/).length;
    const technicalTerms = this._countTechnicalTerms(description);
    
    score = Math.min(
      this.config.maxComplexityScore,
      (words * 0.5) + (sentences * 2) + (technicalTerms * 5) + this._getLevelScore(level)
    );
    
    return {
      level,
      score,
      factors,
      metrics: {
        wordCount: words,
        sentenceCount: sentences,
        technicalTermCount: technicalTerms
      }
    };
  }

  /**
   * Extract requirements from task description
   * @param {string} description - Task description
   * @returns {Object} Requirements
   * @private
   */
  _extractRequirements(description) {
    const requirements = {
      functional: [],
      nonFunctional: [],
      technical: [],
      business: []
    };
    
    // Extract functional requirements
    const functionalPatterns = [
      /should\s+(.+?)(?:\.|$)/gi,
      /must\s+(.+?)(?:\.|$)/gi,
      /need\s+to\s+(.+?)(?:\.|$)/gi,
      /require\s+(.+?)(?:\.|$)/gi
    ];
    
    functionalPatterns.forEach(pattern => {
      const matches = [...description.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) {
          requirements.functional.push(match[1].trim());
        }
      });
    });
    
    // Extract technical requirements
    const techKeywords = [
      'database', 'api', 'authentication', 'security', 'performance',
      'scalability', 'testing', 'deployment', 'monitoring'
    ];
    
    techKeywords.forEach(keyword => {
      if (description.toLowerCase().includes(keyword)) {
        requirements.technical.push(keyword);
      }
    });
    
    return requirements;
  }

  /**
   * Identify technologies mentioned in the description
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Object} Technologies
   * @private
   */
  _identifyTechnologies(description, context) {
    const technologies = {
      languages: [],
      frameworks: [],
      databases: [],
      tools: [],
      platforms: []
    };
    
    const lowerDesc = description.toLowerCase();
    
    // Identify languages
    this.config.supportedLanguages.forEach(lang => {
      if (lowerDesc.includes(lang)) {
        technologies.languages.push(lang);
      }
    });
    
    // Identify frameworks
    this.config.supportedFrameworks.forEach(framework => {
      if (lowerDesc.includes(framework)) {
        technologies.frameworks.push(framework);
      }
    });
    
    // Common databases
    const databases = ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite'];
    databases.forEach(db => {
      if (lowerDesc.includes(db)) {
        technologies.databases.push(db);
      }
    });
    
    // Add context technologies
    if (context.repository) {
      const repoTech = this._inferTechnologiesFromRepo(context.repository);
      Object.keys(technologies).forEach(key => {
        if (repoTech[key]) {
          technologies[key] = [...new Set([...technologies[key], ...repoTech[key]])];
        }
      });
    }
    
    return technologies;
  }

  /**
   * Identify file types that will be affected
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Array} File types
   * @private
   */
  _identifyFileTypes(description, context) {
    const fileTypes = new Set();
    
    // Common file extensions mentioned
    const extensionPattern = /\.([a-z0-9]+)/gi;
    const matches = [...description.matchAll(extensionPattern)];
    matches.forEach(match => fileTypes.add(match[1]));
    
    // Infer from technologies
    const technologies = this._identifyTechnologies(description, context);
    
    technologies.languages.forEach(lang => {
      switch (lang) {
        case 'javascript':
          fileTypes.add('js');
          break;
        case 'typescript':
          fileTypes.add('ts');
          break;
        case 'python':
          fileTypes.add('py');
          break;
        case 'java':
          fileTypes.add('java');
          break;
        default:
          fileTypes.add(lang);
      }
    });
    
    return Array.from(fileTypes);
  }

  /**
   * Identify dependencies that might be needed
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Array} Dependencies
   * @private
   */
  _identifyDependencies(description, context) {
    const dependencies = [];
    
    // Common dependency patterns
    const depPatterns = {
      'express': /express|server|api/i,
      'react': /react|component|jsx/i,
      'axios': /http|api.*request|fetch/i,
      'lodash': /utility|helper.*function/i,
      'moment': /date|time/i,
      'bcrypt': /password|hash|encrypt/i,
      'jsonwebtoken': /jwt|token|auth/i,
      'mongoose': /mongodb|database.*model/i
    };
    
    Object.entries(depPatterns).forEach(([dep, pattern]) => {
      if (pattern.test(description)) {
        dependencies.push(dep);
      }
    });
    
    return dependencies;
  }

  /**
   * Analyze task scope
   * @param {string} description - Task description
   * @returns {Object} Scope analysis
   * @private
   */
  _analyzeScope(description) {
    const scope = {
      size: 'small',
      affectedAreas: [],
      estimatedFiles: 1,
      estimatedLines: 50
    };
    
    // Determine scope size
    if (description.length > 200 || /multiple|several|various/i.test(description)) {
      scope.size = 'large';
      scope.estimatedFiles = 5;
      scope.estimatedLines = 300;
    } else if (description.length > 100 || /component|feature|module/i.test(description)) {
      scope.size = 'medium';
      scope.estimatedFiles = 3;
      scope.estimatedLines = 150;
    }
    
    // Identify affected areas
    const areas = ['frontend', 'backend', 'database', 'api', 'ui', 'auth', 'testing'];
    areas.forEach(area => {
      if (description.toLowerCase().includes(area)) {
        scope.affectedAreas.push(area);
      }
    });
    
    return scope;
  }

  /**
   * Estimate effort required
   * @param {string} description - Task description
   * @returns {Object} Effort estimation
   * @private
   */
  _estimateEffort(description) {
    const complexity = this._analyzeComplexity(description);
    const scope = this._analyzeScope(description);
    
    let hours = 1;
    let confidence = 0.8;
    
    // Base estimation on complexity
    switch (complexity.level) {
      case 'simple':
        hours = 1;
        break;
      case 'medium':
        hours = 4;
        break;
      case 'complex':
        hours = 8;
        confidence = 0.6;
        break;
    }
    
    // Adjust based on scope
    hours *= scope.estimatedFiles;
    
    return {
      estimatedHours: hours,
      confidence,
      complexity: complexity.level,
      scope: scope.size
    };
  }

  /**
   * Identify risk factors
   * @param {string} description - Task description
   * @returns {Array} Risk factors
   * @private
   */
  _identifyRiskFactors(description) {
    const risks = [];
    
    const riskPatterns = {
      'Breaking changes': /break|remove|delete|drop/i,
      'Security implications': /auth|security|password|token/i,
      'Performance impact': /performance|optimize|slow|fast/i,
      'Database changes': /database|migration|schema/i,
      'External dependencies': /api|service|third.*party/i,
      'Complex logic': /algorithm|complex|calculation/i
    };
    
    Object.entries(riskPatterns).forEach(([risk, pattern]) => {
      if (pattern.test(description)) {
        risks.push(risk);
      }
    });
    
    return risks;
  }

  /**
   * Generate optimized prompt for Codegen
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {string} Codegen prompt
   * @private
   */
  _generateCodegenPrompt(description, context) {
    const analysis = {
      intent: this._analyzeIntent(description),
      technologies: this._identifyTechnologies(description, context),
      requirements: this._extractRequirements(description)
    };
    
    let prompt = `Task: ${description}\n\n`;
    
    // Add context
    if (context.repository) {
      prompt += `Repository: ${context.repository}\n`;
    }
    
    // Add technical context
    if (analysis.technologies.languages.length > 0) {
      prompt += `Languages: ${analysis.technologies.languages.join(', ')}\n`;
    }
    
    if (analysis.technologies.frameworks.length > 0) {
      prompt += `Frameworks: ${analysis.technologies.frameworks.join(', ')}\n`;
    }
    
    // Add requirements
    if (analysis.requirements.functional.length > 0) {
      prompt += `\nRequirements:\n${analysis.requirements.functional.map(req => `- ${req}`).join('\n')}\n`;
    }
    
    // Add intent-specific instructions
    prompt += `\nIntent: ${analysis.intent.primary}\n`;
    prompt += this._getIntentInstructions(analysis.intent.primary);
    
    return prompt;
  }

  /**
   * Calculate task priority
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Object} Priority information
   * @private
   */
  _calculatePriority(description, context) {
    let score = 50; // Base priority
    let level = 'medium';
    
    // High priority keywords
    const highPriorityPatterns = [
      /urgent/i, /critical/i, /bug/i, /fix/i, /security/i, /production/i
    ];
    
    // Low priority keywords
    const lowPriorityPatterns = [
      /nice.*to.*have/i, /future/i, /eventually/i, /consider/i
    ];
    
    if (highPriorityPatterns.some(pattern => pattern.test(description))) {
      score += 30;
      level = 'high';
    } else if (lowPriorityPatterns.some(pattern => pattern.test(description))) {
      score -= 20;
      level = 'low';
    }
    
    // Context-based adjustments
    if (context.deadline) {
      const deadline = new Date(context.deadline);
      const now = new Date();
      const daysUntilDeadline = (deadline - now) / (1000 * 60 * 60 * 24);
      
      if (daysUntilDeadline < 1) {
        score += 40;
        level = 'critical';
      } else if (daysUntilDeadline < 7) {
        score += 20;
        level = 'high';
      }
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      level,
      factors: {
        hasDeadline: !!context.deadline,
        isUrgent: highPriorityPatterns.some(pattern => pattern.test(description)),
        isLowPriority: lowPriorityPatterns.some(pattern => pattern.test(description))
      }
    };
  }

  /**
   * Perform detailed analysis
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Detailed analysis
   * @private
   */
  async _performDetailedAnalysis(description, context) {
    // This could be extended with ML-based analysis in the future
    return {
      sentiment: this._analyzeSentiment(description),
      entities: this._extractEntities(description),
      keywords: this._extractKeywords(description),
      suggestions: this._generateSuggestions(description, context)
    };
  }

  // Helper methods

  _getIntentDescription(intent) {
    const descriptions = {
      create: 'Creating new functionality or components',
      modify: 'Modifying existing code or features',
      fix: 'Fixing bugs or resolving issues',
      delete: 'Removing code or features',
      refactor: 'Improving code structure or performance'
    };
    return descriptions[intent] || 'Unknown intent';
  }

  _getIntentInstructions(intent) {
    const instructions = {
      create: '\nPlease create new, well-structured code following best practices.',
      modify: '\nPlease modify the existing code while maintaining compatibility.',
      fix: '\nPlease identify and fix the issue while preserving existing functionality.',
      delete: '\nPlease safely remove the specified code and update dependencies.',
      refactor: '\nPlease improve the code structure while maintaining the same functionality.'
    };
    return instructions[intent] || '';
  }

  _getLevelScore(level) {
    const scores = { simple: 10, medium: 30, complex: 60 };
    return scores[level] || 10;
  }

  _countTechnicalTerms(description) {
    const techTerms = [
      'api', 'database', 'component', 'function', 'class', 'method',
      'authentication', 'authorization', 'validation', 'optimization',
      'refactor', 'migrate', 'deploy', 'test', 'debug'
    ];
    
    return techTerms.filter(term => 
      description.toLowerCase().includes(term)
    ).length;
  }

  _inferTechnologiesFromRepo(repository) {
    // This could be enhanced to actually analyze the repository
    // For now, return empty arrays
    return {
      languages: [],
      frameworks: [],
      databases: [],
      tools: [],
      platforms: []
    };
  }

  _analyzeSentiment(description) {
    // Simple sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'improve', 'enhance'];
    const negativeWords = ['bad', 'broken', 'issue', 'problem', 'bug'];
    
    const positive = positiveWords.filter(word => 
      description.toLowerCase().includes(word)
    ).length;
    
    const negative = negativeWords.filter(word => 
      description.toLowerCase().includes(word)
    ).length;
    
    if (positive > negative) return 'positive';
    if (negative > positive) return 'negative';
    return 'neutral';
  }

  _extractEntities(description) {
    // Simple entity extraction
    const entities = [];
    
    // Extract file names
    const filePattern = /\b\w+\.\w+\b/g;
    const files = description.match(filePattern) || [];
    entities.push(...files.map(file => ({ type: 'file', value: file })));
    
    // Extract URLs
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = description.match(urlPattern) || [];
    entities.push(...urls.map(url => ({ type: 'url', value: url })));
    
    return entities;
  }

  _extractKeywords(description) {
    // Simple keyword extraction
    const words = description.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
  }

  _generateSuggestions(description, context) {
    const suggestions = [];
    
    // Suggest testing if not mentioned
    if (!/test/i.test(description)) {
      suggestions.push('Consider adding tests for the new functionality');
    }
    
    // Suggest documentation if complex
    const complexity = this._analyzeComplexity(description);
    if (complexity.level !== 'simple') {
      suggestions.push('Consider adding documentation for this feature');
    }
    
    // Suggest security review for auth-related tasks
    if (/auth|security|password/i.test(description)) {
      suggestions.push('Consider a security review for authentication changes');
    }
    
    return suggestions;
  }
}

export default TaskAnalyzer;

