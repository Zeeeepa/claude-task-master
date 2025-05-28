/**
 * @fileoverview Extract Requirements from Natural Language Tasks
 * @description Advanced requirement extraction for natural language processing
 */

import { log } from '../utils/logger.js';

/**
 * Requirement Extractor for natural language tasks
 */
export class RequirementExtractor {
  constructor(config = {}) {
    this.config = {
      enableDetailedExtraction: config.enableDetailedExtraction !== false,
      includeImplicitRequirements: config.includeImplicitRequirements !== false,
      confidenceThreshold: config.confidenceThreshold || 0.6,
      maxRequirements: config.maxRequirements || 20
    };
    
    // Requirement patterns
    this.requirementPatterns = {
      functional: {
        explicit: [
          /should\s+(.+?)(?:\.|$|,)/gi,
          /must\s+(.+?)(?:\.|$|,)/gi,
          /need\s+to\s+(.+?)(?:\.|$|,)/gi,
          /require\s+(.+?)(?:\.|$|,)/gi,
          /has\s+to\s+(.+?)(?:\.|$|,)/gi,
          /ought\s+to\s+(.+?)(?:\.|$|,)/gi
        ],
        implicit: [
          /add\s+(.+?)(?:\.|$|,)/gi,
          /create\s+(.+?)(?:\.|$|,)/gi,
          /implement\s+(.+?)(?:\.|$|,)/gi,
          /build\s+(.+?)(?:\.|$|,)/gi,
          /develop\s+(.+?)(?:\.|$|,)/gi
        ]
      },
      nonFunctional: {
        performance: [
          /fast/i, /quick/i, /speed/i, /performance/i, /optimize/i, /efficient/i
        ],
        security: [
          /secure/i, /auth/i, /permission/i, /encrypt/i, /safe/i, /protect/i
        ],
        usability: [
          /user.*friendly/i, /easy.*use/i, /intuitive/i, /accessible/i
        ],
        reliability: [
          /reliable/i, /stable/i, /robust/i, /error.*handling/i
        ],
        scalability: [
          /scalable/i, /scale/i, /handle.*load/i, /concurrent/i
        ],
        maintainability: [
          /maintainable/i, /clean.*code/i, /documented/i, /modular/i
        ]
      },
      technical: {
        database: [
          /database/i, /db/i, /sql/i, /nosql/i, /mongodb/i, /mysql/i, /postgresql/i
        ],
        api: [
          /api/i, /rest/i, /graphql/i, /endpoint/i, /service/i
        ],
        frontend: [
          /ui/i, /interface/i, /component/i, /react/i, /vue/i, /angular/i
        ],
        backend: [
          /server/i, /backend/i, /service/i, /microservice/i
        ],
        testing: [
          /test/i, /testing/i, /unit.*test/i, /integration.*test/i
        ],
        deployment: [
          /deploy/i, /deployment/i, /docker/i, /kubernetes/i, /ci\/cd/i
        ]
      },
      business: {
        compliance: [
          /gdpr/i, /hipaa/i, /compliance/i, /regulation/i, /audit/i
        ],
        integration: [
          /integrate/i, /third.*party/i, /external.*service/i, /webhook/i
        ],
        reporting: [
          /report/i, /analytics/i, /metrics/i, /dashboard/i, /chart/i
        ]
      }
    };
    
    // Constraint patterns
    this.constraintPatterns = {
      time: [
        /within\s+(\d+)\s+(day|week|month)s?/gi,
        /by\s+(.+?)(?:\.|$)/gi,
        /deadline/i, /urgent/i, /asap/i
      ],
      budget: [
        /budget/i, /cost/i, /expensive/i, /cheap/i, /free/i
      ],
      technology: [
        /using\s+(.+?)(?:\.|$|,)/gi,
        /with\s+(.+?)(?:\.|$|,)/gi,
        /in\s+(javascript|python|java|go|rust|php|ruby)/gi
      ],
      compatibility: [
        /compatible/i, /backward.*compatible/i, /legacy/i, /migration/i
      ]
    };
    
    log('debug', 'RequirementExtractor initialized', { config: this.config });
  }

  /**
   * Extract requirements from natural language description
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Extracted requirements
   */
  async extractRequirements(description, context = {}) {
    try {
      log('info', `Extracting requirements from: ${description.substring(0, 100)}...`);
      
      const requirements = {
        functional: await this._extractFunctionalRequirements(description),
        nonFunctional: await this._extractNonFunctionalRequirements(description),
        technical: await this._extractTechnicalRequirements(description),
        business: await this._extractBusinessRequirements(description),
        constraints: await this._extractConstraints(description),
        metadata: {
          extractedAt: new Date().toISOString(),
          totalCount: 0,
          confidence: 0,
          source: 'natural_language'
        }
      };
      
      // Calculate metadata
      requirements.metadata.totalCount = this._countRequirements(requirements);
      requirements.metadata.confidence = this._calculateConfidence(requirements, description);
      
      // Add implicit requirements if enabled
      if (this.config.includeImplicitRequirements) {
        await this._addImplicitRequirements(requirements, description, context);
      }
      
      // Validate and clean requirements
      await this._validateRequirements(requirements);
      
      log('info', `Requirements extracted successfully`, {
        functional: requirements.functional.length,
        nonFunctional: Object.keys(requirements.nonFunctional).length,
        technical: Object.keys(requirements.technical).length,
        confidence: requirements.metadata.confidence
      });
      
      return requirements;
      
    } catch (error) {
      log('error', `Requirement extraction failed: ${error.message}`);
      throw new Error(`Requirement extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract functional requirements
   * @param {string} description - Task description
   * @returns {Promise<Array>} Functional requirements
   * @private
   */
  async _extractFunctionalRequirements(description) {
    const requirements = [];
    
    // Extract explicit functional requirements
    for (const pattern of this.requirementPatterns.functional.explicit) {
      const matches = [...description.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].trim()) {
          requirements.push({
            text: match[1].trim(),
            type: 'explicit',
            confidence: 0.9,
            source: pattern.source
          });
        }
      });
    }
    
    // Extract implicit functional requirements
    for (const pattern of this.requirementPatterns.functional.implicit) {
      const matches = [...description.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].trim()) {
          requirements.push({
            text: match[1].trim(),
            type: 'implicit',
            confidence: 0.7,
            source: pattern.source
          });
        }
      });
    }
    
    // Clean and deduplicate
    return this._cleanRequirements(requirements);
  }

  /**
   * Extract non-functional requirements
   * @param {string} description - Task description
   * @returns {Promise<Object>} Non-functional requirements
   * @private
   */
  async _extractNonFunctionalRequirements(description) {
    const requirements = {};
    
    for (const [category, patterns] of Object.entries(this.requirementPatterns.nonFunctional)) {
      requirements[category] = [];
      
      for (const pattern of patterns) {
        if (pattern.test(description)) {
          requirements[category].push({
            detected: true,
            confidence: 0.8,
            pattern: pattern.source
          });
        }
      }
      
      // Remove empty categories
      if (requirements[category].length === 0) {
        delete requirements[category];
      }
    }
    
    return requirements;
  }

  /**
   * Extract technical requirements
   * @param {string} description - Task description
   * @returns {Promise<Object>} Technical requirements
   * @private
   */
  async _extractTechnicalRequirements(description) {
    const requirements = {};
    
    for (const [category, patterns] of Object.entries(this.requirementPatterns.technical)) {
      const matches = [];
      
      for (const pattern of patterns) {
        if (pattern.test(description)) {
          matches.push({
            detected: true,
            confidence: 0.8,
            pattern: pattern.source
          });
        }
      }
      
      if (matches.length > 0) {
        requirements[category] = matches;
      }
    }
    
    return requirements;
  }

  /**
   * Extract business requirements
   * @param {string} description - Task description
   * @returns {Promise<Object>} Business requirements
   * @private
   */
  async _extractBusinessRequirements(description) {
    const requirements = {};
    
    for (const [category, patterns] of Object.entries(this.requirementPatterns.business)) {
      const matches = [];
      
      for (const pattern of patterns) {
        if (pattern.test(description)) {
          matches.push({
            detected: true,
            confidence: 0.7,
            pattern: pattern.source
          });
        }
      }
      
      if (matches.length > 0) {
        requirements[category] = matches;
      }
    }
    
    return requirements;
  }

  /**
   * Extract constraints
   * @param {string} description - Task description
   * @returns {Promise<Object>} Constraints
   * @private
   */
  async _extractConstraints(description) {
    const constraints = {};
    
    // Time constraints
    const timeMatches = [];
    for (const pattern of this.constraintPatterns.time) {
      const matches = [...description.matchAll(pattern)];
      matches.forEach(match => {
        timeMatches.push({
          text: match[0],
          value: match[1] || null,
          confidence: 0.8
        });
      });
    }
    if (timeMatches.length > 0) {
      constraints.time = timeMatches;
    }
    
    // Technology constraints
    const techMatches = [];
    for (const pattern of this.constraintPatterns.technology) {
      const matches = [...description.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].trim()) {
          techMatches.push({
            text: match[1].trim(),
            confidence: 0.9
          });
        }
      });
    }
    if (techMatches.length > 0) {
      constraints.technology = techMatches;
    }
    
    // Budget constraints
    if (this.constraintPatterns.budget.some(pattern => pattern.test(description))) {
      constraints.budget = [{
        detected: true,
        confidence: 0.6
      }];
    }
    
    // Compatibility constraints
    if (this.constraintPatterns.compatibility.some(pattern => pattern.test(description))) {
      constraints.compatibility = [{
        detected: true,
        confidence: 0.7
      }];
    }
    
    return constraints;
  }

  /**
   * Add implicit requirements based on context
   * @param {Object} requirements - Current requirements
   * @param {string} description - Task description
   * @param {Object} context - Additional context
   * @private
   */
  async _addImplicitRequirements(requirements, description, context) {
    // Add testing requirements for complex tasks
    if (description.length > 200 || /complex|advanced/i.test(description)) {
      if (!requirements.technical.testing) {
        requirements.technical.testing = [{
          detected: true,
          confidence: 0.6,
          implicit: true,
          reason: 'Complex task requires testing'
        }];
      }
    }
    
    // Add documentation requirements for new features
    if (/create|add|implement|build/i.test(description)) {
      if (!requirements.nonFunctional.maintainability) {
        requirements.nonFunctional.maintainability = [{
          detected: true,
          confidence: 0.5,
          implicit: true,
          reason: 'New features should be documented'
        }];
      }
    }
    
    // Add security requirements for auth-related tasks
    if (/auth|login|password|security/i.test(description)) {
      if (!requirements.nonFunctional.security) {
        requirements.nonFunctional.security = [{
          detected: true,
          confidence: 0.8,
          implicit: true,
          reason: 'Authentication requires security considerations'
        }];
      }
    }
    
    // Add performance requirements for data processing
    if (/process|handle|large|data|performance/i.test(description)) {
      if (!requirements.nonFunctional.performance) {
        requirements.nonFunctional.performance = [{
          detected: true,
          confidence: 0.7,
          implicit: true,
          reason: 'Data processing requires performance considerations'
        }];
      }
    }
  }

  /**
   * Validate and clean requirements
   * @param {Object} requirements - Requirements to validate
   * @private
   */
  async _validateRequirements(requirements) {
    // Remove low-confidence requirements
    requirements.functional = requirements.functional.filter(
      req => req.confidence >= this.config.confidenceThreshold
    );
    
    // Limit total number of requirements
    if (requirements.functional.length > this.config.maxRequirements) {
      requirements.functional = requirements.functional
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.config.maxRequirements);
    }
    
    // Clean requirement text
    requirements.functional.forEach(req => {
      req.text = this._cleanRequirementText(req.text);
    });
  }

  /**
   * Clean requirements array
   * @param {Array} requirements - Requirements to clean
   * @returns {Array} Cleaned requirements
   * @private
   */
  _cleanRequirements(requirements) {
    // Remove duplicates
    const seen = new Set();
    const unique = requirements.filter(req => {
      const key = req.text.toLowerCase().trim();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    
    // Sort by confidence
    return unique.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Clean requirement text
   * @param {string} text - Text to clean
   * @returns {string} Cleaned text
   * @private
   */
  _cleanRequirementText(text) {
    return text
      .trim()
      .replace(/^(be\s+|have\s+|include\s+)/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?-]/g, '')
      .trim();
  }

  /**
   * Count total requirements
   * @param {Object} requirements - Requirements object
   * @returns {number} Total count
   * @private
   */
  _countRequirements(requirements) {
    let count = requirements.functional.length;
    
    Object.values(requirements.nonFunctional).forEach(category => {
      count += category.length;
    });
    
    Object.values(requirements.technical).forEach(category => {
      count += category.length;
    });
    
    Object.values(requirements.business).forEach(category => {
      count += category.length;
    });
    
    return count;
  }

  /**
   * Calculate confidence score
   * @param {Object} requirements - Requirements object
   * @param {string} description - Original description
   * @returns {number} Confidence score
   * @private
   */
  _calculateConfidence(requirements, description) {
    if (requirements.functional.length === 0) {
      return 0.1;
    }
    
    const avgConfidence = requirements.functional.reduce(
      (sum, req) => sum + req.confidence, 0
    ) / requirements.functional.length;
    
    // Boost confidence if we found multiple types of requirements
    const typeCount = Object.keys(requirements.nonFunctional).length +
                     Object.keys(requirements.technical).length +
                     Object.keys(requirements.business).length;
    
    const typeBonus = Math.min(0.2, typeCount * 0.05);
    
    return Math.min(1.0, avgConfidence + typeBonus);
  }

  /**
   * Extract acceptance criteria
   * @param {string} description - Task description
   * @returns {Promise<Array>} Acceptance criteria
   */
  async extractAcceptanceCriteria(description) {
    const criteria = [];
    
    // Look for explicit criteria patterns
    const criteriaPatterns = [
      /given\s+(.+?)\s+when\s+(.+?)\s+then\s+(.+?)(?:\.|$)/gi,
      /acceptance\s+criteria:?\s*(.+?)(?:\n|$)/gi,
      /criteria:?\s*(.+?)(?:\n|$)/gi
    ];
    
    for (const pattern of criteriaPatterns) {
      const matches = [...description.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) {
          criteria.push({
            text: match[1].trim(),
            type: 'explicit',
            confidence: 0.9
          });
        }
      });
    }
    
    // Generate implicit criteria from functional requirements
    const requirements = await this.extractRequirements(description);
    requirements.functional.forEach(req => {
      criteria.push({
        text: `The system ${req.text}`,
        type: 'implicit',
        confidence: req.confidence * 0.8,
        derivedFrom: req.text
      });
    });
    
    return criteria.slice(0, 10); // Limit to 10 criteria
  }

  /**
   * Prioritize requirements
   * @param {Object} requirements - Requirements object
   * @param {Object} context - Additional context
   * @returns {Object} Prioritized requirements
   */
  prioritizeRequirements(requirements, context = {}) {
    const prioritized = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    requirements.functional.forEach(req => {
      let priority = 'medium';
      
      // Critical: explicit requirements with high confidence
      if (req.type === 'explicit' && req.confidence > 0.8) {
        priority = 'critical';
      }
      // High: security, performance, or business requirements
      else if (/security|auth|performance|business/i.test(req.text)) {
        priority = 'high';
      }
      // Low: implicit requirements with low confidence
      else if (req.type === 'implicit' && req.confidence < 0.7) {
        priority = 'low';
      }
      
      prioritized[priority].push(req);
    });
    
    return prioritized;
  }

  /**
   * Generate requirement summary
   * @param {Object} requirements - Requirements object
   * @returns {Object} Summary
   */
  generateSummary(requirements) {
    return {
      totalRequirements: this._countRequirements(requirements),
      functionalCount: requirements.functional.length,
      nonFunctionalCategories: Object.keys(requirements.nonFunctional).length,
      technicalCategories: Object.keys(requirements.technical).length,
      businessCategories: Object.keys(requirements.business).length,
      constraintTypes: Object.keys(requirements.constraints).length,
      averageConfidence: requirements.metadata.confidence,
      extractedAt: requirements.metadata.extractedAt,
      topRequirements: requirements.functional.slice(0, 5).map(req => req.text)
    };
  }
}

export default RequirementExtractor;

