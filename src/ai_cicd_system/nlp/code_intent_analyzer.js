/**
 * @fileoverview Analyze Coding Intent and Complexity
 * @description Advanced analysis of coding intent and complexity estimation
 */

import { log } from '../utils/logger.js';

/**
 * Code Intent Analyzer for understanding coding requirements
 */
export class CodeIntentAnalyzer {
  constructor(config = {}) {
    this.config = {
      enableComplexityAnalysis: config.enableComplexityAnalysis !== false,
      enablePatternRecognition: config.enablePatternRecognition !== false,
      complexityWeights: config.complexityWeights || {
        lines: 0.1,
        functions: 2,
        classes: 3,
        files: 1.5,
        dependencies: 1,
        patterns: 0.5
      }
    };
    
    // Intent classification patterns
    this.intentPatterns = {
      create: {
        patterns: [
          /create\s+(?:a\s+)?(.+)/i,
          /add\s+(?:a\s+)?(.+)/i,
          /implement\s+(.+)/i,
          /build\s+(?:a\s+)?(.+)/i,
          /develop\s+(?:a\s+)?(.+)/i,
          /generate\s+(?:a\s+)?(.+)/i,
          /make\s+(?:a\s+)?(.+)/i
        ],
        confidence: 0.9,
        complexity_multiplier: 1.0
      },
      modify: {
        patterns: [
          /update\s+(.+)/i,
          /change\s+(.+)/i,
          /modify\s+(.+)/i,
          /edit\s+(.+)/i,
          /alter\s+(.+)/i,
          /improve\s+(.+)/i,
          /enhance\s+(.+)/i
        ],
        confidence: 0.8,
        complexity_multiplier: 0.7
      },
      fix: {
        patterns: [
          /fix\s+(.+)/i,
          /repair\s+(.+)/i,
          /resolve\s+(.+)/i,
          /debug\s+(.+)/i,
          /correct\s+(.+)/i,
          /solve\s+(.+)/i
        ],
        confidence: 0.9,
        complexity_multiplier: 0.6
      },
      refactor: {
        patterns: [
          /refactor\s+(.+)/i,
          /restructure\s+(.+)/i,
          /reorganize\s+(.+)/i,
          /optimize\s+(.+)/i,
          /clean\s+up\s+(.+)/i,
          /simplify\s+(.+)/i
        ],
        confidence: 0.8,
        complexity_multiplier: 0.8
      },
      delete: {
        patterns: [
          /remove\s+(.+)/i,
          /delete\s+(.+)/i,
          /drop\s+(.+)/i,
          /eliminate\s+(.+)/i,
          /get\s+rid\s+of\s+(.+)/i
        ],
        confidence: 0.9,
        complexity_multiplier: 0.3
      },
      test: {
        patterns: [
          /test\s+(.+)/i,
          /write\s+tests?\s+for\s+(.+)/i,
          /add\s+tests?\s+(.+)/i,
          /unit\s+test\s+(.+)/i,
          /integration\s+test\s+(.+)/i
        ],
        confidence: 0.8,
        complexity_multiplier: 0.5
      }
    };
    
    // Code artifact patterns
    this.artifactPatterns = {
      function: {
        patterns: [/function/i, /method/i, /procedure/i, /routine/i],
        complexity: 2,
        estimated_lines: 15
      },
      class: {
        patterns: [/class/i, /object/i, /model/i],
        complexity: 5,
        estimated_lines: 50
      },
      component: {
        patterns: [/component/i, /widget/i, /element/i],
        complexity: 4,
        estimated_lines: 40
      },
      module: {
        patterns: [/module/i, /package/i, /library/i],
        complexity: 6,
        estimated_lines: 100
      },
      api: {
        patterns: [/api/i, /endpoint/i, /route/i, /service/i],
        complexity: 4,
        estimated_lines: 30
      },
      database: {
        patterns: [/database/i, /table/i, /schema/i, /migration/i],
        complexity: 5,
        estimated_lines: 25
      },
      interface: {
        patterns: [/interface/i, /contract/i, /protocol/i],
        complexity: 3,
        estimated_lines: 20
      },
      configuration: {
        patterns: [/config/i, /setting/i, /environment/i],
        complexity: 2,
        estimated_lines: 10
      }
    };
    
    // Complexity indicators
    this.complexityIndicators = {
      high: [
        /algorithm/i, /machine\s+learning/i, /ai/i, /neural/i, /optimization/i,
        /distributed/i, /microservice/i, /architecture/i, /framework/i,
        /security/i, /encryption/i, /authentication/i, /authorization/i,
        /real\s*time/i, /concurrent/i, /parallel/i, /async/i,
        /integration/i, /migration/i, /transformation/i
      ],
      medium: [
        /validation/i, /parsing/i, /processing/i, /calculation/i,
        /workflow/i, /pipeline/i, /automation/i, /scheduling/i,
        /notification/i, /email/i, /reporting/i, /dashboard/i,
        /search/i, /filter/i, /sorting/i, /pagination/i
      ],
      low: [
        /display/i, /show/i, /hide/i, /toggle/i, /button/i,
        /text/i, /label/i, /color/i, /style/i, /css/i,
        /log/i, /print/i, /console/i, /debug/i
      ]
    };
    
    log('debug', 'CodeIntentAnalyzer initialized', { config: this.config });
  }

  /**
   * Analyze coding intent from natural language description
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Intent analysis
   */
  async analyzeIntent(description, context = {}) {
    try {
      log('info', `Analyzing coding intent: ${description.substring(0, 100)}...`);
      
      const analysis = {
        primary_intent: await this._classifyPrimaryIntent(description),
        secondary_intents: await this._identifySecondaryIntents(description),
        artifacts: await this._identifyCodeArtifacts(description),
        complexity: await this._analyzeComplexity(description, context),
        patterns: await this._recognizePatterns(description),
        scope: await this._analyzeScope(description),
        dependencies: await this._analyzeDependencies(description),
        metadata: {
          analyzedAt: new Date().toISOString(),
          confidence: 0,
          description_length: description.length,
          word_count: description.split(/\s+/).length
        }
      };
      
      // Calculate overall confidence
      analysis.metadata.confidence = this._calculateOverallConfidence(analysis);
      
      log('info', `Intent analysis completed`, {
        primary_intent: analysis.primary_intent.intent,
        complexity: analysis.complexity.level,
        artifacts: analysis.artifacts.length,
        confidence: analysis.metadata.confidence
      });
      
      return analysis;
      
    } catch (error) {
      log('error', `Intent analysis failed: ${error.message}`);
      throw new Error(`Intent analysis failed: ${error.message}`);
    }
  }

  /**
   * Classify primary intent
   * @param {string} description - Task description
   * @returns {Promise<Object>} Primary intent
   * @private
   */
  async _classifyPrimaryIntent(description) {
    let bestMatch = {
      intent: 'unknown',
      confidence: 0,
      matched_text: '',
      pattern: null
    };
    
    for (const [intent, config] of Object.entries(this.intentPatterns)) {
      for (const pattern of config.patterns) {
        const match = description.match(pattern);
        if (match) {
          const confidence = config.confidence * (match[0].length / description.length);
          
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              intent,
              confidence,
              matched_text: match[1] || match[0],
              pattern: pattern.source,
              complexity_multiplier: config.complexity_multiplier
            };
          }
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * Identify secondary intents
   * @param {string} description - Task description
   * @returns {Promise<Array>} Secondary intents
   * @private
   */
  async _identifySecondaryIntents(description) {
    const secondaryIntents = [];
    
    for (const [intent, config] of Object.entries(this.intentPatterns)) {
      for (const pattern of config.patterns) {
        const matches = [...description.matchAll(new RegExp(pattern, 'gi'))];
        
        matches.forEach(match => {
          if (match[1]) {
            secondaryIntents.push({
              intent,
              matched_text: match[1],
              confidence: config.confidence * 0.7, // Lower confidence for secondary
              pattern: pattern.source
            });
          }
        });
      }
    }
    
    // Remove duplicates and sort by confidence
    return this._deduplicateIntents(secondaryIntents)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3); // Keep top 3 secondary intents
  }

  /**
   * Identify code artifacts
   * @param {string} description - Task description
   * @returns {Promise<Array>} Code artifacts
   * @private
   */
  async _identifyCodeArtifacts(description) {
    const artifacts = [];
    
    for (const [type, config] of Object.entries(this.artifactPatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(description)) {
          artifacts.push({
            type,
            confidence: 0.8,
            estimated_complexity: config.complexity,
            estimated_lines: config.estimated_lines,
            pattern: pattern.source
          });
        }
      }
    }
    
    // Look for specific artifact mentions
    const specificArtifacts = this._extractSpecificArtifacts(description);
    artifacts.push(...specificArtifacts);
    
    return this._deduplicateArtifacts(artifacts);
  }

  /**
   * Analyze complexity
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Complexity analysis
   * @private
   */
  async _analyzeComplexity(description, context) {
    let complexityScore = 0;
    const factors = [];
    
    // Base complexity from description length
    const lengthScore = Math.min(10, description.length / 20);
    complexityScore += lengthScore;
    factors.push({ factor: 'description_length', score: lengthScore });
    
    // Complexity from indicators
    for (const [level, patterns] of Object.entries(this.complexityIndicators)) {
      const matches = patterns.filter(pattern => pattern.test(description));
      if (matches.length > 0) {
        const levelScore = this._getLevelScore(level) * matches.length;
        complexityScore += levelScore;
        factors.push({ 
          factor: `${level}_complexity_indicators`, 
          score: levelScore, 
          matches: matches.length 
        });
      }
    }
    
    // Complexity from artifacts
    const artifacts = await this._identifyCodeArtifacts(description);
    const artifactScore = artifacts.reduce((sum, artifact) => 
      sum + artifact.estimated_complexity, 0
    );
    complexityScore += artifactScore;
    factors.push({ factor: 'artifacts', score: artifactScore, count: artifacts.length });
    
    // Complexity from technology stack
    const techComplexity = this._analyzeTechnologyComplexity(description);
    complexityScore += techComplexity;
    factors.push({ factor: 'technology', score: techComplexity });
    
    // Determine complexity level
    const level = this._determineComplexityLevel(complexityScore);
    
    return {
      score: Math.round(complexityScore * 10) / 10,
      level,
      factors,
      estimated_hours: this._estimateHours(complexityScore, level),
      estimated_lines: this._estimateLines(artifacts, complexityScore),
      estimated_files: this._estimateFiles(artifacts, level)
    };
  }

  /**
   * Recognize patterns in the description
   * @param {string} description - Task description
   * @returns {Promise<Array>} Recognized patterns
   * @private
   */
  async _recognizePatterns(description) {
    if (!this.config.enablePatternRecognition) {
      return [];
    }
    
    const patterns = [];
    
    // Design patterns
    const designPatterns = [
      { name: 'MVC', pattern: /mvc|model.*view.*controller/i },
      { name: 'Observer', pattern: /observer|event.*listener|subscribe/i },
      { name: 'Factory', pattern: /factory|create.*instance/i },
      { name: 'Singleton', pattern: /singleton|single.*instance/i },
      { name: 'Repository', pattern: /repository|data.*access/i },
      { name: 'Service', pattern: /service.*layer|business.*logic/i }
    ];
    
    designPatterns.forEach(({ name, pattern }) => {
      if (pattern.test(description)) {
        patterns.push({
          type: 'design_pattern',
          name,
          confidence: 0.7,
          pattern: pattern.source
        });
      }
    });
    
    // Architectural patterns
    const archPatterns = [
      { name: 'REST API', pattern: /rest|api.*endpoint|http.*service/i },
      { name: 'Microservice', pattern: /microservice|service.*oriented/i },
      { name: 'Event-driven', pattern: /event.*driven|message.*queue/i },
      { name: 'CRUD', pattern: /crud|create.*read.*update.*delete/i }
    ];
    
    archPatterns.forEach(({ name, pattern }) => {
      if (pattern.test(description)) {
        patterns.push({
          type: 'architectural_pattern',
          name,
          confidence: 0.8,
          pattern: pattern.source
        });
      }
    });
    
    return patterns;
  }

  /**
   * Analyze scope of the task
   * @param {string} description - Task description
   * @returns {Promise<Object>} Scope analysis
   * @private
   */
  async _analyzeScope(description) {
    const scope = {
      size: 'small',
      areas: [],
      impact: 'low',
      risk_level: 'low'
    };
    
    // Determine size based on keywords
    const sizeIndicators = {
      large: [/entire|whole|complete|full|comprehensive|major/i],
      medium: [/multiple|several|various|some/i],
      small: [/single|one|simple|basic|minor/i]
    };
    
    for (const [size, patterns] of Object.entries(sizeIndicators)) {
      if (patterns.some(pattern => pattern.test(description))) {
        scope.size = size;
        break;
      }
    }
    
    // Identify affected areas
    const areas = [
      { name: 'frontend', patterns: [/ui|interface|frontend|client/i] },
      { name: 'backend', patterns: [/backend|server|api/i] },
      { name: 'database', patterns: [/database|db|data/i] },
      { name: 'authentication', patterns: [/auth|login|security/i] },
      { name: 'testing', patterns: [/test|testing|spec/i] },
      { name: 'deployment', patterns: [/deploy|deployment|production/i] }
    ];
    
    areas.forEach(({ name, patterns }) => {
      if (patterns.some(pattern => pattern.test(description))) {
        scope.areas.push(name);
      }
    });
    
    // Determine impact and risk
    if (scope.areas.length > 2 || scope.size === 'large') {
      scope.impact = 'high';
      scope.risk_level = 'medium';
    } else if (scope.areas.length > 1 || scope.size === 'medium') {
      scope.impact = 'medium';
      scope.risk_level = 'low';
    }
    
    // Increase risk for critical areas
    const criticalAreas = ['authentication', 'database', 'security'];
    if (scope.areas.some(area => criticalAreas.includes(area))) {
      scope.risk_level = scope.risk_level === 'low' ? 'medium' : 'high';
    }
    
    return scope;
  }

  /**
   * Analyze dependencies
   * @param {string} description - Task description
   * @returns {Promise<Object>} Dependencies analysis
   * @private
   */
  async _analyzeDependencies(description) {
    const dependencies = {
      external: [],
      internal: [],
      technology: [],
      estimated_count: 0
    };
    
    // Common external dependencies
    const externalDeps = [
      { name: 'express', patterns: [/express|web.*server/i] },
      { name: 'react', patterns: [/react|jsx/i] },
      { name: 'axios', patterns: [/http.*client|api.*request/i] },
      { name: 'lodash', patterns: [/utility|helper.*function/i] },
      { name: 'moment', patterns: [/date|time.*format/i] },
      { name: 'bcrypt', patterns: [/password.*hash|encrypt/i] },
      { name: 'jsonwebtoken', patterns: [/jwt|token/i] }
    ];
    
    externalDeps.forEach(({ name, patterns }) => {
      if (patterns.some(pattern => pattern.test(description))) {
        dependencies.external.push({
          name,
          confidence: 0.7,
          reason: 'inferred from description'
        });
      }
    });
    
    // Technology dependencies
    const techDeps = [
      { name: 'database', patterns: [/database|sql|nosql/i] },
      { name: 'web_framework', patterns: [/web.*framework|server/i] },
      { name: 'testing_framework', patterns: [/test|testing/i] },
      { name: 'build_tool', patterns: [/build|compile|bundle/i] }
    ];
    
    techDeps.forEach(({ name, patterns }) => {
      if (patterns.some(pattern => pattern.test(description))) {
        dependencies.technology.push({
          name,
          confidence: 0.6,
          reason: 'inferred from description'
        });
      }
    });
    
    dependencies.estimated_count = 
      dependencies.external.length + 
      dependencies.internal.length + 
      dependencies.technology.length;
    
    return dependencies;
  }

  // Helper methods

  /**
   * Extract specific artifacts mentioned in description
   * @param {string} description - Task description
   * @returns {Array} Specific artifacts
   * @private
   */
  _extractSpecificArtifacts(description) {
    const artifacts = [];
    
    // Look for file extensions
    const filePattern = /\w+\.(js|ts|py|java|go|rs|php|rb|css|html|json|yaml|yml)/gi;
    const fileMatches = [...description.matchAll(filePattern)];
    
    fileMatches.forEach(match => {
      artifacts.push({
        type: 'file',
        name: match[0],
        confidence: 0.9,
        estimated_complexity: 2,
        estimated_lines: 20
      });
    });
    
    // Look for specific function/class names
    const namePattern = /(?:function|class|component)\s+(\w+)/gi;
    const nameMatches = [...description.matchAll(namePattern)];
    
    nameMatches.forEach(match => {
      artifacts.push({
        type: match[0].toLowerCase().includes('class') ? 'class' : 'function',
        name: match[1],
        confidence: 0.8,
        estimated_complexity: match[0].toLowerCase().includes('class') ? 5 : 2,
        estimated_lines: match[0].toLowerCase().includes('class') ? 50 : 15
      });
    });
    
    return artifacts;
  }

  /**
   * Deduplicate intents
   * @param {Array} intents - Intents array
   * @returns {Array} Deduplicated intents
   * @private
   */
  _deduplicateIntents(intents) {
    const seen = new Set();
    return intents.filter(intent => {
      const key = `${intent.intent}-${intent.matched_text}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Deduplicate artifacts
   * @param {Array} artifacts - Artifacts array
   * @returns {Array} Deduplicated artifacts
   * @private
   */
  _deduplicateArtifacts(artifacts) {
    const seen = new Set();
    return artifacts.filter(artifact => {
      const key = `${artifact.type}-${artifact.name || 'unnamed'}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get score for complexity level
   * @param {string} level - Complexity level
   * @returns {number} Score
   * @private
   */
  _getLevelScore(level) {
    const scores = { low: 1, medium: 3, high: 6 };
    return scores[level] || 0;
  }

  /**
   * Analyze technology complexity
   * @param {string} description - Task description
   * @returns {number} Technology complexity score
   * @private
   */
  _analyzeTechnologyComplexity(description) {
    const techComplexity = {
      'machine learning': 10,
      'blockchain': 9,
      'microservices': 8,
      'distributed': 7,
      'real-time': 6,
      'authentication': 5,
      'database': 4,
      'api': 3,
      'frontend': 2,
      'css': 1
    };
    
    let score = 0;
    for (const [tech, complexity] of Object.entries(techComplexity)) {
      if (new RegExp(tech, 'i').test(description)) {
        score += complexity;
      }
    }
    
    return Math.min(score, 20); // Cap at 20
  }

  /**
   * Determine complexity level from score
   * @param {number} score - Complexity score
   * @returns {string} Complexity level
   * @private
   */
  _determineComplexityLevel(score) {
    if (score < 10) return 'simple';
    if (score < 25) return 'medium';
    return 'complex';
  }

  /**
   * Estimate hours based on complexity
   * @param {number} score - Complexity score
   * @param {string} level - Complexity level
   * @returns {number} Estimated hours
   * @private
   */
  _estimateHours(score, level) {
    const baseHours = { simple: 1, medium: 4, complex: 8 };
    const base = baseHours[level] || 2;
    
    // Add variation based on score
    const variation = (score % 10) / 10;
    return Math.round((base + (base * variation)) * 10) / 10;
  }

  /**
   * Estimate lines of code
   * @param {Array} artifacts - Code artifacts
   * @param {number} complexityScore - Complexity score
   * @returns {number} Estimated lines
   * @private
   */
  _estimateLines(artifacts, complexityScore) {
    let lines = 0;
    
    artifacts.forEach(artifact => {
      lines += artifact.estimated_lines || 20;
    });
    
    // Add base lines if no artifacts
    if (lines === 0) {
      lines = Math.max(10, complexityScore * 2);
    }
    
    return Math.round(lines);
  }

  /**
   * Estimate number of files
   * @param {Array} artifacts - Code artifacts
   * @param {string} level - Complexity level
   * @returns {number} Estimated files
   * @private
   */
  _estimateFiles(artifacts, level) {
    const fileArtifacts = artifacts.filter(a => a.type === 'file').length;
    
    if (fileArtifacts > 0) {
      return fileArtifacts;
    }
    
    const baseFiles = { simple: 1, medium: 2, complex: 4 };
    return baseFiles[level] || 1;
  }

  /**
   * Calculate overall confidence
   * @param {Object} analysis - Analysis result
   * @returns {number} Overall confidence
   * @private
   */
  _calculateOverallConfidence(analysis) {
    const weights = {
      primary_intent: 0.4,
      artifacts: 0.3,
      complexity: 0.2,
      patterns: 0.1
    };
    
    let confidence = 0;
    
    confidence += analysis.primary_intent.confidence * weights.primary_intent;
    
    if (analysis.artifacts.length > 0) {
      const avgArtifactConfidence = analysis.artifacts.reduce(
        (sum, artifact) => sum + artifact.confidence, 0
      ) / analysis.artifacts.length;
      confidence += avgArtifactConfidence * weights.artifacts;
    }
    
    // Complexity confidence based on number of factors
    const complexityConfidence = Math.min(1.0, analysis.complexity.factors.length / 5);
    confidence += complexityConfidence * weights.complexity;
    
    if (analysis.patterns.length > 0) {
      const avgPatternConfidence = analysis.patterns.reduce(
        (sum, pattern) => sum + pattern.confidence, 0
      ) / analysis.patterns.length;
      confidence += avgPatternConfidence * weights.patterns;
    }
    
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Generate intent summary
   * @param {Object} analysis - Intent analysis
   * @returns {Object} Summary
   */
  generateSummary(analysis) {
    return {
      primary_intent: analysis.primary_intent.intent,
      confidence: analysis.metadata.confidence,
      complexity_level: analysis.complexity.level,
      estimated_effort: `${analysis.complexity.estimated_hours} hours`,
      estimated_scope: `${analysis.complexity.estimated_files} files, ${analysis.complexity.estimated_lines} lines`,
      key_artifacts: analysis.artifacts.slice(0, 3).map(a => a.type),
      recognized_patterns: analysis.patterns.map(p => p.name),
      scope_areas: analysis.scope.areas,
      risk_level: analysis.scope.risk_level
    };
  }
}

export default CodeIntentAnalyzer;

