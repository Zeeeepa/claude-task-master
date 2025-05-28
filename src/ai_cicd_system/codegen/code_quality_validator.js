/**
 * @fileoverview Code Quality Validator for Codegen Integration
 * @description Validates generated code quality and ensures production standards
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { log } from '../utils/logger.js';

/**
 * Code Quality Validator for ensuring generated code meets production standards
 */
export class CodeQualityValidator {
  constructor(config = {}) {
    this.config = config;
    this.validationRules = config.validationRules || this._getDefaultValidationRules();
    this.qualityThreshold = config.qualityThreshold || 0.8;
    this.enableLinting = config.enableLinting !== false;
    this.enableTesting = config.enableTesting !== false;
    this.enableSecurity = config.enableSecurity !== false;
    this.enablePerformance = config.enablePerformance !== false;
    this.supportedLanguages = config.supportedLanguages || ['javascript', 'python', 'typescript'];
    this.linterConfigs = config.linterConfigs || this._getDefaultLinterConfigs();
    this.testFrameworks = config.testFrameworks || this._getDefaultTestFrameworks();
    
    log('debug', 'Code Quality Validator initialized', {
      qualityThreshold: this.qualityThreshold,
      enableLinting: this.enableLinting,
      enableTesting: this.enableTesting,
      supportedLanguages: this.supportedLanguages.length
    });
  }

  /**
   * Initialize the validator
   */
  async initialize() {
    try {
      await this._validateTools();
      await this._setupLinterConfigs();
      log('info', 'Code Quality Validator initialized successfully');
    } catch (error) {
      log('error', `Failed to initialize Code Quality Validator: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate code quality for generated files
   * @param {Array<string>} filePaths - Paths to files to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateCode(filePaths, options = {}) {
    try {
      log('info', `Starting code quality validation for ${filePaths.length} files`);

      const validationResults = {
        overall: {
          score: 0,
          passed: false,
          threshold: this.qualityThreshold
        },
        files: {},
        summary: {
          totalFiles: filePaths.length,
          passedFiles: 0,
          failedFiles: 0,
          skippedFiles: 0
        },
        categories: {
          syntax: { score: 0, issues: [] },
          style: { score: 0, issues: [] },
          complexity: { score: 0, issues: [] },
          security: { score: 0, issues: [] },
          performance: { score: 0, issues: [] },
          testing: { score: 0, issues: [] },
          documentation: { score: 0, issues: [] }
        },
        recommendations: [],
        validatedAt: new Date().toISOString()
      };

      // Validate each file
      for (const filePath of filePaths) {
        try {
          const fileResult = await this._validateFile(filePath, options);
          validationResults.files[filePath] = fileResult;
          
          if (fileResult.passed) {
            validationResults.summary.passedFiles++;
          } else {
            validationResults.summary.failedFiles++;
          }

          // Aggregate category scores
          this._aggregateCategoryScores(validationResults.categories, fileResult.categories);
        } catch (error) {
          log('warning', `Failed to validate file ${filePath}: ${error.message}`);
          validationResults.files[filePath] = {
            passed: false,
            error: error.message,
            score: 0
          };
          validationResults.summary.skippedFiles++;
        }
      }

      // Calculate overall score
      validationResults.overall.score = this._calculateOverallScore(validationResults.categories);
      validationResults.overall.passed = validationResults.overall.score >= this.qualityThreshold;

      // Generate recommendations
      validationResults.recommendations = this._generateRecommendations(validationResults);

      log('info', `Code quality validation completed`, {
        overallScore: validationResults.overall.score,
        passed: validationResults.overall.passed,
        passedFiles: validationResults.summary.passedFiles,
        failedFiles: validationResults.summary.failedFiles
      });

      return validationResults;
    } catch (error) {
      log('error', `Code quality validation failed: ${error.message}`);
      throw new ValidationError('VALIDATION_FAILED', 
        `Code quality validation failed: ${error.message}`, error);
    }
  }

  /**
   * Validate a single file
   * @param {string} filePath - Path to file to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} File validation result
   */
  async _validateFile(filePath, options) {
    const fileExtension = path.extname(filePath);
    const language = this._detectLanguage(filePath);
    
    if (!this.supportedLanguages.includes(language)) {
      return {
        passed: true,
        score: 1.0,
        skipped: true,
        reason: `Language ${language} not supported`,
        categories: {}
      };
    }

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const fileStats = await fs.stat(filePath);

    const validationResult = {
      filePath,
      language,
      size: fileStats.size,
      lines: fileContent.split('\n').length,
      passed: false,
      score: 0,
      categories: {
        syntax: { score: 1.0, issues: [] },
        style: { score: 1.0, issues: [] },
        complexity: { score: 1.0, issues: [] },
        security: { score: 1.0, issues: [] },
        performance: { score: 1.0, issues: [] },
        testing: { score: 1.0, issues: [] },
        documentation: { score: 1.0, issues: [] }
      },
      validatedAt: new Date().toISOString()
    };

    // Run validation checks
    await this._validateSyntax(filePath, fileContent, language, validationResult);
    await this._validateStyle(filePath, fileContent, language, validationResult);
    await this._validateComplexity(filePath, fileContent, language, validationResult);
    
    if (this.enableSecurity) {
      await this._validateSecurity(filePath, fileContent, language, validationResult);
    }
    
    if (this.enablePerformance) {
      await this._validatePerformance(filePath, fileContent, language, validationResult);
    }
    
    if (this.enableTesting) {
      await this._validateTesting(filePath, fileContent, language, validationResult);
    }
    
    await this._validateDocumentation(filePath, fileContent, language, validationResult);

    // Calculate overall file score
    const categoryScores = Object.values(validationResult.categories).map(cat => cat.score);
    validationResult.score = categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length;
    validationResult.passed = validationResult.score >= this.qualityThreshold;

    return validationResult;
  }

  /**
   * Validate syntax
   */
  async _validateSyntax(filePath, content, language, result) {
    try {
      if (language === 'javascript' || language === 'typescript') {
        // Use Node.js to check syntax
        const { execSync } = require('child_process');
        execSync(`node -c "${filePath}"`, { stdio: 'pipe' });
      } else if (language === 'python') {
        // Use Python to check syntax
        execSync(`python -m py_compile "${filePath}"`, { stdio: 'pipe' });
      }
      
      result.categories.syntax.score = 1.0;
    } catch (error) {
      result.categories.syntax.score = 0.0;
      result.categories.syntax.issues.push({
        type: 'syntax_error',
        message: 'Syntax error detected',
        details: error.message,
        severity: 'error'
      });
    }
  }

  /**
   * Validate code style
   */
  async _validateStyle(filePath, content, language, result) {
    const issues = [];
    
    // Check indentation consistency
    const lines = content.split('\n');
    const indentationPattern = this._detectIndentationPattern(lines);
    
    if (!indentationPattern.consistent) {
      issues.push({
        type: 'inconsistent_indentation',
        message: 'Inconsistent indentation detected',
        severity: 'warning'
      });
    }

    // Check line length
    const maxLineLength = this.validationRules.maxLineLength || 120;
    lines.forEach((line, index) => {
      if (line.length > maxLineLength) {
        issues.push({
          type: 'line_too_long',
          message: `Line ${index + 1} exceeds maximum length (${line.length} > ${maxLineLength})`,
          line: index + 1,
          severity: 'warning'
        });
      }
    });

    // Check naming conventions
    this._validateNamingConventions(content, language, issues);

    // Run linter if available
    if (this.enableLinting) {
      const linterIssues = await this._runLinter(filePath, language);
      issues.push(...linterIssues);
    }

    result.categories.style.issues = issues;
    result.categories.style.score = Math.max(0, 1 - (issues.length * 0.1));
  }

  /**
   * Validate code complexity
   */
  async _validateComplexity(filePath, content, language, result) {
    const issues = [];
    
    // Calculate cyclomatic complexity
    const complexity = this._calculateCyclomaticComplexity(content, language);
    const maxComplexity = this.validationRules.maxCyclomaticComplexity || 10;
    
    if (complexity > maxComplexity) {
      issues.push({
        type: 'high_complexity',
        message: `Cyclomatic complexity too high (${complexity} > ${maxComplexity})`,
        value: complexity,
        severity: 'warning'
      });
    }

    // Check function length
    const functions = this._extractFunctions(content, language);
    const maxFunctionLength = this.validationRules.maxFunctionLength || 50;
    
    functions.forEach(func => {
      if (func.lines > maxFunctionLength) {
        issues.push({
          type: 'long_function',
          message: `Function '${func.name}' is too long (${func.lines} > ${maxFunctionLength} lines)`,
          function: func.name,
          lines: func.lines,
          severity: 'warning'
        });
      }
    });

    // Check nesting depth
    const maxNestingDepth = this.validationRules.maxNestingDepth || 4;
    const nestingDepth = this._calculateNestingDepth(content, language);
    
    if (nestingDepth > maxNestingDepth) {
      issues.push({
        type: 'deep_nesting',
        message: `Nesting depth too high (${nestingDepth} > ${maxNestingDepth})`,
        depth: nestingDepth,
        severity: 'warning'
      });
    }

    result.categories.complexity.issues = issues;
    result.categories.complexity.score = Math.max(0, 1 - (issues.length * 0.15));
  }

  /**
   * Validate security
   */
  async _validateSecurity(filePath, content, language, result) {
    const issues = [];
    
    // Check for common security issues
    const securityPatterns = this._getSecurityPatterns(language);
    
    securityPatterns.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        issues.push({
          type: 'security_issue',
          message: pattern.message,
          pattern: pattern.name,
          severity: pattern.severity || 'warning'
        });
      }
    });

    // Check for hardcoded secrets
    const secretPatterns = [
      /password\s*=\s*["'][^"']+["']/gi,
      /api[_-]?key\s*=\s*["'][^"']+["']/gi,
      /secret\s*=\s*["'][^"']+["']/gi,
      /token\s*=\s*["'][^"']+["']/gi
    ];

    secretPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        issues.push({
          type: 'hardcoded_secret',
          message: 'Potential hardcoded secret detected',
          severity: 'error'
        });
      }
    });

    result.categories.security.issues = issues;
    result.categories.security.score = Math.max(0, 1 - (issues.length * 0.2));
  }

  /**
   * Validate performance
   */
  async _validatePerformance(filePath, content, language, result) {
    const issues = [];
    
    // Check for performance anti-patterns
    const performancePatterns = this._getPerformancePatterns(language);
    
    performancePatterns.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        issues.push({
          type: 'performance_issue',
          message: pattern.message,
          pattern: pattern.name,
          severity: pattern.severity || 'info'
        });
      }
    });

    // Check file size
    const maxFileSize = this.validationRules.maxFileSize || 1000; // lines
    const lineCount = content.split('\n').length;
    
    if (lineCount > maxFileSize) {
      issues.push({
        type: 'large_file',
        message: `File is too large (${lineCount} > ${maxFileSize} lines)`,
        lines: lineCount,
        severity: 'warning'
      });
    }

    result.categories.performance.issues = issues;
    result.categories.performance.score = Math.max(0, 1 - (issues.length * 0.1));
  }

  /**
   * Validate testing
   */
  async _validateTesting(filePath, content, language, result) {
    const issues = [];
    
    // Check if this is a test file
    const isTestFile = this._isTestFile(filePath);
    
    if (isTestFile) {
      // Validate test structure
      const testPatterns = this._getTestPatterns(language);
      let hasTests = false;
      
      testPatterns.forEach(pattern => {
        if (pattern.test(content)) {
          hasTests = true;
        }
      });
      
      if (!hasTests) {
        issues.push({
          type: 'no_tests',
          message: 'Test file contains no recognizable test cases',
          severity: 'error'
        });
      }
    } else {
      // Check if corresponding test file exists
      const testFilePath = this._getTestFilePath(filePath, language);
      try {
        await fs.access(testFilePath);
      } catch (error) {
        issues.push({
          type: 'missing_tests',
          message: 'No corresponding test file found',
          expectedPath: testFilePath,
          severity: 'warning'
        });
      }
    }

    result.categories.testing.issues = issues;
    result.categories.testing.score = Math.max(0, 1 - (issues.length * 0.2));
  }

  /**
   * Validate documentation
   */
  async _validateDocumentation(filePath, content, language, result) {
    const issues = [];
    
    // Check for file-level documentation
    if (!this._hasFileDocumentation(content, language)) {
      issues.push({
        type: 'missing_file_docs',
        message: 'File lacks proper documentation header',
        severity: 'warning'
      });
    }

    // Check function documentation
    const functions = this._extractFunctions(content, language);
    const undocumentedFunctions = functions.filter(func => !func.hasDocumentation);
    
    undocumentedFunctions.forEach(func => {
      issues.push({
        type: 'missing_function_docs',
        message: `Function '${func.name}' lacks documentation`,
        function: func.name,
        severity: 'info'
      });
    });

    // Check for TODO/FIXME comments
    const todoPattern = /(?:TODO|FIXME|HACK|XXX):/gi;
    const todoMatches = content.match(todoPattern);
    
    if (todoMatches && todoMatches.length > 0) {
      issues.push({
        type: 'todo_comments',
        message: `Found ${todoMatches.length} TODO/FIXME comments`,
        count: todoMatches.length,
        severity: 'info'
      });
    }

    result.categories.documentation.issues = issues;
    result.categories.documentation.score = Math.max(0, 1 - (issues.length * 0.1));
  }

  // Helper methods

  /**
   * Detect programming language from file path
   */
  _detectLanguage(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const languageMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rb': 'ruby',
      '.php': 'php'
    };
    
    return languageMap[extension] || 'unknown';
  }

  /**
   * Detect indentation pattern
   */
  _detectIndentationPattern(lines) {
    const indentations = [];
    
    lines.forEach(line => {
      const match = line.match(/^(\s*)/);
      if (match && match[1].length > 0) {
        indentations.push(match[1]);
      }
    });

    const hasSpaces = indentations.some(indent => indent.includes(' '));
    const hasTabs = indentations.some(indent => indent.includes('\t'));
    
    return {
      consistent: !(hasSpaces && hasTabs),
      type: hasSpaces ? 'spaces' : 'tabs',
      mixed: hasSpaces && hasTabs
    };
  }

  /**
   * Validate naming conventions
   */
  _validateNamingConventions(content, language, issues) {
    // This is a simplified implementation
    // In practice, you'd want more sophisticated AST parsing
    
    if (language === 'javascript' || language === 'typescript') {
      // Check camelCase for variables and functions
      const variablePattern = /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
      let match;
      
      while ((match = variablePattern.exec(content)) !== null) {
        const varName = match[1];
        if (!/^[a-z$_][a-zA-Z0-9$_]*$/.test(varName) && !/^[A-Z][A-Z0-9_]*$/.test(varName)) {
          issues.push({
            type: 'naming_convention',
            message: `Variable '${varName}' doesn't follow camelCase convention`,
            variable: varName,
            severity: 'info'
          });
        }
      }
    }
  }

  /**
   * Calculate cyclomatic complexity
   */
  _calculateCyclomaticComplexity(content, language) {
    // Simplified complexity calculation
    // Count decision points: if, while, for, case, catch, &&, ||
    const patterns = [
      /\bif\s*\(/g,
      /\bwhile\s*\(/g,
      /\bfor\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /&&/g,
      /\|\|/g
    ];
    
    let complexity = 1; // Base complexity
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });
    
    return complexity;
  }

  /**
   * Extract functions from code
   */
  _extractFunctions(content, language) {
    const functions = [];
    
    if (language === 'javascript' || language === 'typescript') {
      // Simple function extraction - in practice, use AST parsing
      const functionPattern = /(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:function|\([^)]*\)\s*=>))/g;
      let match;
      
      while ((match = functionPattern.exec(content)) !== null) {
        const name = match[1] || match[2];
        const startIndex = match.index;
        const lines = content.substring(0, startIndex).split('\n').length;
        
        functions.push({
          name,
          startLine: lines,
          lines: 10, // Simplified - would need proper parsing
          hasDocumentation: this._checkFunctionDocumentation(content, startIndex, language)
        });
      }
    }
    
    return functions;
  }

  /**
   * Calculate nesting depth
   */
  _calculateNestingDepth(content, language) {
    const lines = content.split('\n');
    let maxDepth = 0;
    let currentDepth = 0;
    
    lines.forEach(line => {
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      currentDepth += openBraces - closeBraces;
      maxDepth = Math.max(maxDepth, currentDepth);
    });
    
    return maxDepth;
  }

  /**
   * Get security patterns for language
   */
  _getSecurityPatterns(language) {
    const patterns = [];
    
    if (language === 'javascript' || language === 'typescript') {
      patterns.push(
        {
          name: 'eval_usage',
          regex: /\beval\s*\(/g,
          message: 'Use of eval() is dangerous and should be avoided',
          severity: 'error'
        },
        {
          name: 'innerHTML_usage',
          regex: /\.innerHTML\s*=/g,
          message: 'Direct innerHTML assignment can lead to XSS vulnerabilities',
          severity: 'warning'
        }
      );
    }
    
    return patterns;
  }

  /**
   * Get performance patterns for language
   */
  _getPerformancePatterns(language) {
    const patterns = [];
    
    if (language === 'javascript' || language === 'typescript') {
      patterns.push(
        {
          name: 'nested_loops',
          regex: /for\s*\([^)]*\)\s*\{[^}]*for\s*\(/g,
          message: 'Nested loops can impact performance',
          severity: 'info'
        }
      );
    }
    
    return patterns;
  }

  /**
   * Get test patterns for language
   */
  _getTestPatterns(language) {
    if (language === 'javascript' || language === 'typescript') {
      return [
        /\b(?:describe|it|test)\s*\(/g,
        /\b(?:expect|assert)\s*\(/g
      ];
    }
    
    if (language === 'python') {
      return [
        /\bdef\s+test_/g,
        /\bassert\s+/g
      ];
    }
    
    return [];
  }

  /**
   * Check if file is a test file
   */
  _isTestFile(filePath) {
    const fileName = path.basename(filePath);
    return /\.(test|spec)\./i.test(fileName) || 
           fileName.startsWith('test_') ||
           filePath.includes('/test/') ||
           filePath.includes('/__tests__/');
  }

  /**
   * Get expected test file path
   */
  _getTestFilePath(filePath, language) {
    const dir = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    
    // Try common test file patterns
    const patterns = [
      path.join(dir, `${name}.test${ext}`),
      path.join(dir, `${name}.spec${ext}`),
      path.join(dir, '__tests__', `${name}.test${ext}`),
      path.join(dir, 'test', `test_${name}${ext}`)
    ];
    
    return patterns[0]; // Return first pattern for simplicity
  }

  /**
   * Check if file has documentation
   */
  _hasFileDocumentation(content, language) {
    const lines = content.split('\n').slice(0, 10); // Check first 10 lines
    
    if (language === 'javascript' || language === 'typescript') {
      return lines.some(line => 
        line.includes('/**') || 
        line.includes('* @fileoverview') ||
        line.includes('* @description')
      );
    }
    
    if (language === 'python') {
      return lines.some(line => 
        line.includes('"""') || 
        line.includes("'''")
      );
    }
    
    return false;
  }

  /**
   * Check function documentation
   */
  _checkFunctionDocumentation(content, functionIndex, language) {
    const beforeFunction = content.substring(Math.max(0, functionIndex - 200), functionIndex);
    
    if (language === 'javascript' || language === 'typescript') {
      return /\/\*\*[\s\S]*?\*\/\s*$/.test(beforeFunction);
    }
    
    if (language === 'python') {
      return /"""[\s\S]*?"""\s*$/.test(beforeFunction) || 
             /'''[\s\S]*?'''\s*$/.test(beforeFunction);
    }
    
    return false;
  }

  /**
   * Run linter for file
   */
  async _runLinter(filePath, language) {
    const issues = [];
    
    try {
      const linterConfig = this.linterConfigs[language];
      if (!linterConfig) return issues;
      
      const command = linterConfig.command.replace('{file}', filePath);
      const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
      
      // Parse linter output (simplified)
      const lines = output.split('\n');
      lines.forEach(line => {
        if (line.trim() && !line.startsWith('✓')) {
          issues.push({
            type: 'linter_issue',
            message: line.trim(),
            severity: 'warning'
          });
        }
      });
    } catch (error) {
      // Linter failed or found issues
      if (error.stdout) {
        issues.push({
          type: 'linter_error',
          message: 'Linter found issues',
          details: error.stdout,
          severity: 'warning'
        });
      }
    }
    
    return issues;
  }

  /**
   * Aggregate category scores
   */
  _aggregateCategoryScores(overallCategories, fileCategories) {
    Object.keys(overallCategories).forEach(category => {
      if (fileCategories[category]) {
        overallCategories[category].score += fileCategories[category].score;
        overallCategories[category].issues.push(...fileCategories[category].issues);
      }
    });
  }

  /**
   * Calculate overall score
   */
  _calculateOverallScore(categories) {
    const scores = Object.values(categories).map(cat => cat.score);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Generate recommendations
   */
  _generateRecommendations(validationResults) {
    const recommendations = [];
    
    Object.entries(validationResults.categories).forEach(([category, data]) => {
      if (data.score < 0.8 && data.issues.length > 0) {
        recommendations.push(`Improve ${category}: ${data.issues.length} issues found`);
      }
    });
    
    if (validationResults.summary.failedFiles > 0) {
      recommendations.push(`${validationResults.summary.failedFiles} files failed validation`);
    }
    
    return recommendations;
  }

  /**
   * Validate required tools
   */
  async _validateTools() {
    // Check if required tools are available
    const tools = ['node', 'python'];
    
    for (const tool of tools) {
      try {
        execSync(`${tool} --version`, { stdio: 'pipe' });
      } catch (error) {
        log('warning', `Tool ${tool} not available for validation`);
      }
    }
  }

  /**
   * Setup linter configurations
   */
  async _setupLinterConfigs() {
    // Setup would involve checking for linter config files
    // and creating default ones if needed
  }

  /**
   * Get default validation rules
   */
  _getDefaultValidationRules() {
    return {
      maxLineLength: 120,
      maxCyclomaticComplexity: 10,
      maxFunctionLength: 50,
      maxNestingDepth: 4,
      maxFileSize: 1000
    };
  }

  /**
   * Get default linter configurations
   */
  _getDefaultLinterConfigs() {
    return {
      javascript: {
        command: 'eslint {file} --format compact',
        configFile: '.eslintrc.js'
      },
      typescript: {
        command: 'eslint {file} --format compact',
        configFile: '.eslintrc.js'
      },
      python: {
        command: 'flake8 {file}',
        configFile: '.flake8'
      }
    };
  }

  /**
   * Get default test frameworks
   */
  _getDefaultTestFrameworks() {
    return {
      javascript: ['jest', 'mocha', 'jasmine'],
      typescript: ['jest', 'mocha'],
      python: ['pytest', 'unittest']
    };
  }
}

/**
 * Validation Error class
 */
export class ValidationError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.originalError = originalError;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

export default CodeQualityValidator;

