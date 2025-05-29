/**
 * @fileoverview Codebase Context Handling for Codegen
 * @description Advanced context management for intelligent code generation
 */

import { log } from '../../utils/logger.js';

/**
 * Context Manager for Codegen integration
 */
export class ContextManager {
  constructor(config = {}) {
    this.config = {
      maxContextSize: config.maxContextSize || 10000,
      includeFileStructure: config.includeFileStructure !== false,
      includeRecentChanges: config.includeRecentChanges !== false,
      includeDependencies: config.includeDependencies !== false,
      contextCacheSize: config.contextCacheSize || 100,
      enableSmartFiltering: config.enableSmartFiltering !== false
    };
    
    // Context cache for performance
    this.contextCache = new Map();
    this.fileStructureCache = null;
    this.dependencyCache = null;
    
    // File type priorities for context inclusion
    this.fileTypePriorities = {
      '.js': 10,
      '.ts': 10,
      '.jsx': 9,
      '.tsx': 9,
      '.py': 8,
      '.java': 8,
      '.go': 7,
      '.rs': 7,
      '.php': 6,
      '.rb': 6,
      '.json': 5,
      '.yaml': 4,
      '.yml': 4,
      '.md': 3,
      '.txt': 2
    };
    
    log('debug', 'ContextManager initialized', { config: this.config });
  }

  /**
   * Build comprehensive context for Codegen request
   * @param {Object} analysis - Task analysis
   * @param {Object} options - Context options
   * @returns {Promise<Object>} Context data
   */
  async buildContext(analysis, options = {}) {
    try {
      log('info', `Building context for ${analysis.intent.primary} task`);
      
      const context = {
        task: {
          description: analysis.originalDescription,
          intent: analysis.intent.primary,
          complexity: analysis.complexity.level,
          technologies: analysis.technologies
        },
        codebase: await this._buildCodebaseContext(analysis, options),
        environment: await this._buildEnvironmentContext(options),
        constraints: this._buildConstraints(analysis),
        metadata: {
          generatedAt: new Date().toISOString(),
          contextSize: 0,
          includedFiles: 0,
          cacheHit: false
        }
      };
      
      // Calculate context size
      context.metadata.contextSize = this._calculateContextSize(context);
      context.metadata.includedFiles = this._countIncludedFiles(context);
      
      // Optimize context if too large
      if (context.metadata.contextSize > this.config.maxContextSize) {
        await this._optimizeContext(context, analysis);
      }
      
      log('info', `Context built successfully`, {
        size: context.metadata.contextSize,
        files: context.metadata.includedFiles,
        intent: analysis.intent.primary
      });
      
      return context;
      
    } catch (error) {
      log('error', `Context building failed: ${error.message}`);
      throw new Error(`Context building failed: ${error.message}`);
    }
  }

  /**
   * Build codebase-specific context
   * @param {Object} analysis - Task analysis
   * @param {Object} options - Context options
   * @returns {Promise<Object>} Codebase context
   * @private
   */
  async _buildCodebaseContext(analysis, options) {
    const context = {
      structure: null,
      relevantFiles: [],
      dependencies: null,
      patterns: [],
      recentChanges: []
    };
    
    // Build file structure
    if (this.config.includeFileStructure) {
      context.structure = await this._getFileStructure(options.repository);
    }
    
    // Find relevant files
    context.relevantFiles = await this._findRelevantFiles(analysis, options);
    
    // Get dependencies
    if (this.config.includeDependencies) {
      context.dependencies = await this._getDependencies(options.repository);
    }
    
    // Identify code patterns
    context.patterns = await this._identifyCodePatterns(analysis, context.relevantFiles);
    
    // Get recent changes
    if (this.config.includeRecentChanges) {
      context.recentChanges = await this._getRecentChanges(options.repository);
    }
    
    return context;
  }

  /**
   * Build environment context
   * @param {Object} options - Context options
   * @returns {Promise<Object>} Environment context
   * @private
   */
  async _buildEnvironmentContext(options) {
    return {
      repository: options.repository || null,
      branch: options.branch || 'main',
      platform: process.platform,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build constraints based on analysis
   * @param {Object} analysis - Task analysis
   * @returns {Object} Constraints
   * @private
   */
  _buildConstraints(analysis) {
    const constraints = {
      maxFiles: this._calculateMaxFiles(analysis.complexity.level),
      preferredLanguages: analysis.technologies.languages,
      riskFactors: analysis.riskFactors,
      estimatedEffort: analysis.estimatedEffort
    };
    
    // Add complexity-specific constraints
    switch (analysis.complexity.level) {
      case 'simple':
        constraints.maxChanges = 1;
        constraints.preferSingleFile = true;
        break;
      case 'medium':
        constraints.maxChanges = 3;
        constraints.allowNewFiles = true;
        break;
      case 'complex':
        constraints.maxChanges = 10;
        constraints.allowArchitecturalChanges = true;
        break;
    }
    
    return constraints;
  }

  /**
   * Get file structure
   * @param {string} repository - Repository path
   * @returns {Promise<Object>} File structure
   * @private
   */
  async _getFileStructure(repository) {
    // Check cache first
    if (this.fileStructureCache) {
      log('debug', 'Using cached file structure');
      return this.fileStructureCache;
    }
    
    try {
      // This would typically use git or filesystem APIs
      // For now, return a mock structure
      const structure = {
        root: repository || '.',
        directories: [
          'src/',
          'tests/',
          'docs/',
          'config/'
        ],
        files: [
          'package.json',
          'README.md',
          'tsconfig.json'
        ],
        totalFiles: 0,
        totalDirectories: 0
      };
      
      // Cache the result
      this.fileStructureCache = structure;
      
      return structure;
      
    } catch (error) {
      log('warning', `Failed to get file structure: ${error.message}`);
      return null;
    }
  }

  /**
   * Find relevant files based on analysis
   * @param {Object} analysis - Task analysis
   * @param {Object} options - Context options
   * @returns {Promise<Array>} Relevant files
   * @private
   */
  async _findRelevantFiles(analysis, options) {
    const relevantFiles = [];
    
    try {
      // Find files based on technologies
      const techFiles = await this._findFilesByTechnology(analysis.technologies);
      relevantFiles.push(...techFiles);
      
      // Find files based on keywords
      const keywordFiles = await this._findFilesByKeywords(analysis.originalDescription);
      relevantFiles.push(...keywordFiles);
      
      // Find files based on file types
      if (analysis.fileTypes.length > 0) {
        const typeFiles = await this._findFilesByTypes(analysis.fileTypes);
        relevantFiles.push(...typeFiles);
      }
      
      // Remove duplicates and sort by relevance
      const uniqueFiles = this._deduplicateFiles(relevantFiles);
      const sortedFiles = this._sortFilesByRelevance(uniqueFiles, analysis);
      
      // Limit based on configuration
      const maxFiles = this.config.enableSmartFiltering ? 
        this._calculateMaxFiles(analysis.complexity.level) : 20;
      
      return sortedFiles.slice(0, maxFiles);
      
    } catch (error) {
      log('warning', `Failed to find relevant files: ${error.message}`);
      return [];
    }
  }

  /**
   * Find files by technology
   * @param {Object} technologies - Technologies from analysis
   * @returns {Promise<Array>} Files
   * @private
   */
  async _findFilesByTechnology(technologies) {
    const files = [];
    
    // Map technologies to file patterns
    const techPatterns = {
      javascript: ['.js', '.mjs'],
      typescript: ['.ts', '.tsx'],
      react: ['.jsx', '.tsx'],
      python: ['.py'],
      java: ['.java'],
      go: ['.go'],
      rust: ['.rs']
    };
    
    for (const lang of technologies.languages) {
      const patterns = techPatterns[lang] || [];
      for (const pattern of patterns) {
        // This would typically search the filesystem
        // For now, return mock files
        files.push({
          path: `src/example${pattern}`,
          type: lang,
          relevance: this.fileTypePriorities[pattern] || 1,
          size: 1000,
          lastModified: new Date().toISOString()
        });
      }
    }
    
    return files;
  }

  /**
   * Find files by keywords
   * @param {string} description - Task description
   * @returns {Promise<Array>} Files
   * @private
   */
  async _findFilesByKeywords(description) {
    const keywords = this._extractKeywords(description);
    const files = [];
    
    // This would typically search file contents
    // For now, return mock results
    for (const keyword of keywords.slice(0, 5)) {
      files.push({
        path: `src/${keyword}.js`,
        type: 'javascript',
        relevance: 5,
        matchedKeyword: keyword,
        size: 800,
        lastModified: new Date().toISOString()
      });
    }
    
    return files;
  }

  /**
   * Find files by types
   * @param {Array} fileTypes - File types
   * @returns {Promise<Array>} Files
   * @private
   */
  async _findFilesByTypes(fileTypes) {
    const files = [];
    
    for (const type of fileTypes) {
      const extension = type.startsWith('.') ? type : `.${type}`;
      
      // This would typically search the filesystem
      files.push({
        path: `src/example${extension}`,
        type: type,
        relevance: this.fileTypePriorities[extension] || 1,
        size: 600,
        lastModified: new Date().toISOString()
      });
    }
    
    return files;
  }

  /**
   * Get dependencies
   * @param {string} repository - Repository path
   * @returns {Promise<Object>} Dependencies
   * @private
   */
  async _getDependencies(repository) {
    // Check cache first
    if (this.dependencyCache) {
      return this.dependencyCache;
    }
    
    try {
      // This would typically read package.json, requirements.txt, etc.
      const dependencies = {
        runtime: {
          'express': '^4.18.0',
          'react': '^18.0.0'
        },
        development: {
          'jest': '^29.0.0',
          'eslint': '^8.0.0'
        },
        peerDependencies: {},
        totalCount: 4
      };
      
      // Cache the result
      this.dependencyCache = dependencies;
      
      return dependencies;
      
    } catch (error) {
      log('warning', `Failed to get dependencies: ${error.message}`);
      return null;
    }
  }

  /**
   * Identify code patterns
   * @param {Object} analysis - Task analysis
   * @param {Array} files - Relevant files
   * @returns {Promise<Array>} Code patterns
   * @private
   */
  async _identifyCodePatterns(analysis, files) {
    const patterns = [];
    
    try {
      // Analyze files for common patterns
      for (const file of files.slice(0, 5)) {
        // This would typically analyze file contents
        patterns.push({
          file: file.path,
          pattern: 'module.exports',
          type: 'export_pattern',
          confidence: 0.8
        });
      }
      
      // Add technology-specific patterns
      for (const lang of analysis.technologies.languages) {
        patterns.push({
          language: lang,
          pattern: this._getLanguagePatterns(lang),
          type: 'language_pattern',
          confidence: 0.9
        });
      }
      
      return patterns;
      
    } catch (error) {
      log('warning', `Failed to identify code patterns: ${error.message}`);
      return [];
    }
  }

  /**
   * Get recent changes
   * @param {string} repository - Repository path
   * @returns {Promise<Array>} Recent changes
   * @private
   */
  async _getRecentChanges(repository) {
    try {
      // This would typically use git log
      return [
        {
          commit: 'abc123',
          message: 'Add user authentication',
          author: 'developer',
          date: new Date(Date.now() - 86400000).toISOString(),
          files: ['src/auth.js', 'src/user.js']
        },
        {
          commit: 'def456',
          message: 'Fix login bug',
          author: 'developer',
          date: new Date(Date.now() - 172800000).toISOString(),
          files: ['src/login.js']
        }
      ];
      
    } catch (error) {
      log('warning', `Failed to get recent changes: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate context size
   * @param {Object} context - Context object
   * @returns {number} Context size in characters
   * @private
   */
  _calculateContextSize(context) {
    return JSON.stringify(context).length;
  }

  /**
   * Count included files
   * @param {Object} context - Context object
   * @returns {number} Number of files
   * @private
   */
  _countIncludedFiles(context) {
    return context.codebase.relevantFiles.length;
  }

  /**
   * Optimize context if too large
   * @param {Object} context - Context object
   * @param {Object} analysis - Task analysis
   * @private
   */
  async _optimizeContext(context, analysis) {
    log('info', `Optimizing context (current size: ${context.metadata.contextSize})`);
    
    // Remove less relevant files
    const maxFiles = Math.floor(this.config.maxContextSize / 1000);
    if (context.codebase.relevantFiles.length > maxFiles) {
      context.codebase.relevantFiles = context.codebase.relevantFiles.slice(0, maxFiles);
    }
    
    // Simplify file structure
    if (context.codebase.structure) {
      context.codebase.structure.files = context.codebase.structure.files.slice(0, 10);
      context.codebase.structure.directories = context.codebase.structure.directories.slice(0, 10);
    }
    
    // Limit recent changes
    if (context.codebase.recentChanges.length > 3) {
      context.codebase.recentChanges = context.codebase.recentChanges.slice(0, 3);
    }
    
    // Recalculate size
    context.metadata.contextSize = this._calculateContextSize(context);
    context.metadata.optimized = true;
    
    log('info', `Context optimized (new size: ${context.metadata.contextSize})`);
  }

  /**
   * Deduplicate files
   * @param {Array} files - Files array
   * @returns {Array} Deduplicated files
   * @private
   */
  _deduplicateFiles(files) {
    const seen = new Set();
    return files.filter(file => {
      if (seen.has(file.path)) {
        return false;
      }
      seen.add(file.path);
      return true;
    });
  }

  /**
   * Sort files by relevance
   * @param {Array} files - Files array
   * @param {Object} analysis - Task analysis
   * @returns {Array} Sorted files
   * @private
   */
  _sortFilesByRelevance(files, analysis) {
    return files.sort((a, b) => {
      // Primary sort by relevance score
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      
      // Secondary sort by technology match
      const aTechMatch = analysis.technologies.languages.includes(a.type) ? 1 : 0;
      const bTechMatch = analysis.technologies.languages.includes(b.type) ? 1 : 0;
      
      if (bTechMatch !== aTechMatch) {
        return bTechMatch - aTechMatch;
      }
      
      // Tertiary sort by file size (smaller files first for context efficiency)
      return a.size - b.size;
    });
  }

  /**
   * Calculate maximum files based on complexity
   * @param {string} complexity - Complexity level
   * @returns {number} Maximum files
   * @private
   */
  _calculateMaxFiles(complexity) {
    switch (complexity) {
      case 'simple':
        return 3;
      case 'medium':
        return 8;
      case 'complex':
        return 15;
      default:
        return 5;
    }
  }

  /**
   * Extract keywords from description
   * @param {string} description - Task description
   * @returns {Array} Keywords
   * @private
   */
  _extractKeywords(description) {
    return description
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 10);
  }

  /**
   * Get language-specific patterns
   * @param {string} language - Programming language
   * @returns {Array} Patterns
   * @private
   */
  _getLanguagePatterns(language) {
    const patterns = {
      javascript: ['function', 'const', 'let', 'class', 'export'],
      typescript: ['interface', 'type', 'enum', 'namespace'],
      python: ['def', 'class', 'import', 'from'],
      java: ['public', 'private', 'class', 'interface'],
      go: ['func', 'type', 'struct', 'interface'],
      rust: ['fn', 'struct', 'enum', 'trait']
    };
    
    return patterns[language] || [];
  }

  /**
   * Clear context cache
   */
  clearCache() {
    this.contextCache.clear();
    this.fileStructureCache = null;
    this.dependencyCache = null;
    log('debug', 'Context cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      contextCacheSize: this.contextCache.size,
      hasFileStructureCache: !!this.fileStructureCache,
      hasDependencyCache: !!this.dependencyCache,
      maxCacheSize: this.config.contextCacheSize
    };
  }

  /**
   * Update context with additional information
   * @param {Object} context - Existing context
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated context
   */
  updateContext(context, updates) {
    const updatedContext = { ...context };
    
    if (updates.files) {
      updatedContext.codebase.relevantFiles.push(...updates.files);
    }
    
    if (updates.patterns) {
      updatedContext.codebase.patterns.push(...updates.patterns);
    }
    
    if (updates.constraints) {
      updatedContext.constraints = { ...updatedContext.constraints, ...updates.constraints };
    }
    
    // Recalculate metadata
    updatedContext.metadata.contextSize = this._calculateContextSize(updatedContext);
    updatedContext.metadata.includedFiles = this._countIncludedFiles(updatedContext);
    updatedContext.metadata.updatedAt = new Date().toISOString();
    
    return updatedContext;
  }
}

export default ContextManager;

