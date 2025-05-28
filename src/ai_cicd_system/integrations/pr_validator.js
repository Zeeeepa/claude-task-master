/**
 * PR Validator - Handles PR validation logic and workflow
 * Coordinates validation steps and manages validation state
 */

import { log } from '../utils/simple_logger.js';

export class PRValidator {
  constructor(config) {
    this.config = config;
    this.validationRules = config.validationRules || this.getDefaultValidationRules();
    this.isInitialized = false;
  }

  async initialize() {
    log('info', '🔧 Initializing PR validator...');
    
    try {
      // Validate configuration
      this.validateConfig();
      
      // Setup validation rules
      this.setupValidationRules();
      
      this.isInitialized = true;
      log('info', '✅ PR validator initialized');
    } catch (error) {
      log('error', `❌ Failed to initialize PR validator: ${error.message}`);
      throw error;
    }
  }

  validateConfig() {
    if (!this.config) {
      throw new Error('Configuration is required for PR validator');
    }
    
    // Validate required configuration options
    const requiredOptions = ['validationTimeout'];
    for (const option of requiredOptions) {
      if (this.config[option] === undefined) {
        log('warn', `Missing configuration option: ${option}, using default`);
      }
    }
  }

  setupValidationRules() {
    // Merge default rules with custom rules
    this.validationRules = {
      ...this.getDefaultValidationRules(),
      ...this.config.validationRules
    };
    
    log('info', `Loaded ${Object.keys(this.validationRules).length} validation rules`);
  }

  getDefaultValidationRules() {
    return {
      // File validation rules
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedFileExtensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h'],
      forbiddenFilePatterns: [/\.env$/, /\.secret$/, /\.key$/, /password/i],
      
      // Code quality rules
      maxLinesPerFile: 1000,
      maxComplexity: 10,
      requireTests: true,
      
      // Security rules
      noHardcodedSecrets: true,
      noSqlInjection: true,
      noXssVulnerabilities: true,
      
      // Style rules
      enforceCodeStyle: true,
      requireDocumentation: false,
      
      // Git rules
      maxCommitSize: 100,
      requireLinearHistory: false,
      requireSignedCommits: false
    };
  }

  async validatePR(prDetails, environment) {
    if (!this.isInitialized) {
      throw new Error('PR validator not initialized. Call initialize() first.');
    }

    log('info', `🔍 Validating PR: ${prDetails.prNumber}`);
    
    const validationResult = {
      prNumber: prDetails.prNumber,
      status: 'in_progress',
      startTime: new Date(),
      validations: {},
      issues: [],
      warnings: [],
      suggestions: [],
      score: 0
    };

    try {
      // Run all validation checks
      await this.runFileValidation(prDetails, environment, validationResult);
      await this.runCodeQualityValidation(prDetails, environment, validationResult);
      await this.runSecurityValidation(prDetails, environment, validationResult);
      await this.runStyleValidation(prDetails, environment, validationResult);
      await this.runGitValidation(prDetails, environment, validationResult);
      
      // Calculate overall score
      validationResult.score = this.calculateValidationScore(validationResult);
      validationResult.status = validationResult.score >= 70 ? 'passed' : 'failed';
      validationResult.endTime = new Date();
      validationResult.duration = validationResult.endTime - validationResult.startTime;
      
      log('info', `✅ PR validation completed: ${prDetails.prNumber} (Score: ${validationResult.score})`);
      return validationResult;
      
    } catch (error) {
      validationResult.status = 'error';
      validationResult.error = error.message;
      validationResult.endTime = new Date();
      
      log('error', `❌ PR validation failed: ${prDetails.prNumber} - ${error.message}`);
      throw error;
    }
  }

  async runFileValidation(prDetails, environment, result) {
    log('info', '📁 Running file validation...');
    
    const fileValidation = {
      checked: 0,
      passed: 0,
      issues: []
    };

    try {
      const files = prDetails.modifiedFiles || [];
      
      for (const file of files) {
        fileValidation.checked++;
        
        // Check file size
        const fileSize = await this.getFileSize(environment, file);
        if (fileSize > this.validationRules.maxFileSize) {
          fileValidation.issues.push({
            type: 'file_size',
            file,
            message: `File size (${fileSize} bytes) exceeds maximum allowed (${this.validationRules.maxFileSize} bytes)`,
            severity: 'error'
          });
          continue;
        }
        
        // Check file extension
        const extension = this.getFileExtension(file);
        if (this.validationRules.allowedFileExtensions.length > 0 && 
            !this.validationRules.allowedFileExtensions.includes(extension)) {
          fileValidation.issues.push({
            type: 'file_extension',
            file,
            message: `File extension '${extension}' is not allowed`,
            severity: 'warning'
          });
          continue;
        }
        
        // Check forbidden patterns
        if (this.validationRules.forbiddenFilePatterns.some(pattern => pattern.test(file))) {
          fileValidation.issues.push({
            type: 'forbidden_pattern',
            file,
            message: 'File matches forbidden pattern',
            severity: 'error'
          });
          continue;
        }
        
        fileValidation.passed++;
      }
      
      result.validations.files = fileValidation;
      result.issues.push(...fileValidation.issues.filter(issue => issue.severity === 'error'));
      result.warnings.push(...fileValidation.issues.filter(issue => issue.severity === 'warning'));
      
    } catch (error) {
      log('error', `File validation failed: ${error.message}`);
      result.validations.files = { error: error.message };
    }
  }

  async runCodeQualityValidation(prDetails, environment, result) {
    log('info', '🎯 Running code quality validation...');
    
    const qualityValidation = {
      checked: 0,
      passed: 0,
      issues: []
    };

    try {
      const files = prDetails.modifiedFiles || [];
      
      for (const file of files) {
        if (!this.isCodeFile(file)) continue;
        
        qualityValidation.checked++;
        
        // Check file length
        const lineCount = await this.getFileLineCount(environment, file);
        if (lineCount > this.validationRules.maxLinesPerFile) {
          qualityValidation.issues.push({
            type: 'file_length',
            file,
            message: `File has ${lineCount} lines, exceeds maximum of ${this.validationRules.maxLinesPerFile}`,
            severity: 'warning'
          });
        }
        
        // Check for test files if required
        if (this.validationRules.requireTests && !this.hasCorrespondingTestFile(file, files)) {
          qualityValidation.issues.push({
            type: 'missing_tests',
            file,
            message: 'No corresponding test file found',
            severity: 'warning'
          });
        }
        
        qualityValidation.passed++;
      }
      
      result.validations.quality = qualityValidation;
      result.issues.push(...qualityValidation.issues.filter(issue => issue.severity === 'error'));
      result.warnings.push(...qualityValidation.issues.filter(issue => issue.severity === 'warning'));
      
    } catch (error) {
      log('error', `Code quality validation failed: ${error.message}`);
      result.validations.quality = { error: error.message };
    }
  }

  async runSecurityValidation(prDetails, environment, result) {
    log('info', '🔒 Running security validation...');
    
    const securityValidation = {
      checked: 0,
      passed: 0,
      issues: []
    };

    try {
      const files = prDetails.modifiedFiles || [];
      
      for (const file of files) {
        if (!this.isCodeFile(file)) continue;
        
        securityValidation.checked++;
        
        // Check for hardcoded secrets
        if (this.validationRules.noHardcodedSecrets) {
          const secrets = await this.checkForHardcodedSecrets(environment, file);
          if (secrets.length > 0) {
            securityValidation.issues.push({
              type: 'hardcoded_secrets',
              file,
              message: `Potential hardcoded secrets found: ${secrets.join(', ')}`,
              severity: 'error'
            });
            continue;
          }
        }
        
        // Check for SQL injection vulnerabilities
        if (this.validationRules.noSqlInjection) {
          const sqlIssues = await this.checkForSqlInjection(environment, file);
          if (sqlIssues.length > 0) {
            securityValidation.issues.push({
              type: 'sql_injection',
              file,
              message: 'Potential SQL injection vulnerability detected',
              severity: 'error'
            });
            continue;
          }
        }
        
        securityValidation.passed++;
      }
      
      result.validations.security = securityValidation;
      result.issues.push(...securityValidation.issues.filter(issue => issue.severity === 'error'));
      result.warnings.push(...securityValidation.issues.filter(issue => issue.severity === 'warning'));
      
    } catch (error) {
      log('error', `Security validation failed: ${error.message}`);
      result.validations.security = { error: error.message };
    }
  }

  async runStyleValidation(prDetails, environment, result) {
    log('info', '🎨 Running style validation...');
    
    const styleValidation = {
      checked: 0,
      passed: 0,
      issues: []
    };

    try {
      if (!this.validationRules.enforceCodeStyle) {
        styleValidation.skipped = true;
        result.validations.style = styleValidation;
        return;
      }
      
      const files = prDetails.modifiedFiles || [];
      
      for (const file of files) {
        if (!this.isCodeFile(file)) continue;
        
        styleValidation.checked++;
        
        // Basic style checks (can be extended with actual linters)
        const styleIssues = await this.checkCodeStyle(environment, file);
        if (styleIssues.length > 0) {
          styleValidation.issues.push(...styleIssues);
        } else {
          styleValidation.passed++;
        }
      }
      
      result.validations.style = styleValidation;
      result.warnings.push(...styleValidation.issues);
      
    } catch (error) {
      log('error', `Style validation failed: ${error.message}`);
      result.validations.style = { error: error.message };
    }
  }

  async runGitValidation(prDetails, environment, result) {
    log('info', '📝 Running Git validation...');
    
    const gitValidation = {
      checked: 0,
      passed: 0,
      issues: []
    };

    try {
      // Check commit count
      const commitCount = prDetails.commits?.length || 0;
      gitValidation.checked++;
      
      if (commitCount > this.validationRules.maxCommitSize) {
        gitValidation.issues.push({
          type: 'too_many_commits',
          message: `PR has ${commitCount} commits, exceeds maximum of ${this.validationRules.maxCommitSize}`,
          severity: 'warning'
        });
      } else {
        gitValidation.passed++;
      }
      
      result.validations.git = gitValidation;
      result.warnings.push(...gitValidation.issues);
      
    } catch (error) {
      log('error', `Git validation failed: ${error.message}`);
      result.validations.git = { error: error.message };
    }
  }

  calculateValidationScore(result) {
    let totalScore = 100;
    let deductions = 0;
    
    // Deduct points for issues
    deductions += result.issues.length * 10; // 10 points per error
    deductions += result.warnings.length * 5; // 5 points per warning
    
    // Bonus points for good practices
    if (result.validations.security?.passed > 0) {
      totalScore += 5; // Security bonus
    }
    
    if (result.validations.quality?.passed > 0) {
      totalScore += 5; // Quality bonus
    }
    
    return Math.max(0, totalScore - deductions);
  }

  // Helper methods
  async getFileSize(environment, file) {
    // Mock implementation - would use actual file system calls
    return Math.floor(Math.random() * 1000000); // Random size for demo
  }

  getFileExtension(file) {
    return file.substring(file.lastIndexOf('.'));
  }

  isCodeFile(file) {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h'];
    return codeExtensions.includes(this.getFileExtension(file));
  }

  async getFileLineCount(environment, file) {
    // Mock implementation
    return Math.floor(Math.random() * 500) + 50;
  }

  hasCorrespondingTestFile(file, allFiles) {
    const baseName = file.replace(/\.[^/.]+$/, '');
    const testPatterns = [
      `${baseName}.test.js`,
      `${baseName}.spec.js`,
      `${baseName}.test.ts`,
      `${baseName}.spec.ts`,
      `tests/${baseName}.js`,
      `__tests__/${baseName}.js`
    ];
    
    return testPatterns.some(pattern => allFiles.includes(pattern));
  }

  async checkForHardcodedSecrets(environment, file) {
    // Mock implementation - would use actual secret detection
    const secretPatterns = [
      /password\s*=\s*["'][^"']+["']/i,
      /api_key\s*=\s*["'][^"']+["']/i,
      /secret\s*=\s*["'][^"']+["']/i
    ];
    
    // Return empty array for demo
    return [];
  }

  async checkForSqlInjection(environment, file) {
    // Mock implementation - would use actual SQL injection detection
    return [];
  }

  async checkCodeStyle(environment, file) {
    // Mock implementation - would use actual linters
    return [];
  }
}

