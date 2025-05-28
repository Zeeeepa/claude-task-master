/**
 * @fileoverview PR Analysis Engine
 * @description Comprehensive PR analysis for code quality and potential issues
 */

import { Octokit } from '@octokit/rest';
import { log } from '../../scripts/modules/utils.js';
import { CodegenErrorHandler } from '../ai_cicd_system/core/error_handler.js';
import { webhookConfig, securityPatterns, validationRules } from './config.js';
import { IssueType, IssueSeverity } from '../database/models/validation.js';

/**
 * PR Analyzer
 * Analyzes pull requests for code quality, security, and best practices
 */
export class PRAnalyzer {
  constructor(config = {}) {
    this.config = {
      githubToken: config.githubToken || webhookConfig.github.token,
      apiUrl: config.apiUrl || webhookConfig.github.apiUrl,
      ...config
    };

    this.octokit = new Octokit({
      auth: this.config.githubToken,
      baseUrl: this.config.apiUrl
    });
    
    this.errorHandler = new CodegenErrorHandler({
      enableRetry: true,
      enableCircuitBreaker: true,
      maxRetries: 3
    });
  }

  /**
   * Analyze PR changes comprehensively
   * @param {Object} pullRequest - GitHub PR object
   * @returns {Promise<Object>} Analysis results
   */
  async analyzePRChanges(pullRequest) {
    return this.errorHandler.handleError(
      async () => {
        log('info', `Analyzing PR #${pullRequest.number}`, {
          repository: pullRequest.base.repo.full_name,
          branch: pullRequest.head.ref,
          commits: pullRequest.commits
        });

        const [files, commits, reviews] = await Promise.all([
          this.getPRFiles(pullRequest),
          this.getPRCommits(pullRequest),
          this.getPRReviews(pullRequest)
        ]);

        const analysis = {
          files: this.analyzeFiles(files),
          commits: this.analyzeCommits(commits),
          reviews: this.analyzeReviews(reviews),
          complexity: this.calculateComplexity(files),
          riskScore: this.calculateRiskScore(files, commits),
          metadata: {
            analyzed_at: new Date().toISOString(),
            pr_number: pullRequest.number,
            repository: pullRequest.base.repo.full_name,
            total_files: files.length,
            total_commits: commits.length
          }
        };

        log('info', 'PR analysis completed', {
          pr_number: pullRequest.number,
          files_analyzed: files.length,
          complexity_score: analysis.complexity.score,
          risk_score: analysis.riskScore
        });

        return analysis;
      },
      { component: 'pr_analyzer', operation: 'analyze_changes' }
    );
  }

  /**
   * Detect issues in PR analysis
   * @param {Object} analysis - PR analysis results
   * @returns {Promise<Array>} Array of detected issues
   */
  async detectIssues(analysis) {
    const issues = [];

    try {
      // Check for large PRs
      if (analysis.files.totalChanges > validationRules.pr.maxSize) {
        issues.push({
          type: IssueType.LARGE_PR,
          severity: IssueSeverity.MEDIUM,
          message: `PR contains ${analysis.files.totalChanges} changes, consider breaking into smaller PRs (max: ${validationRules.pr.maxSize})`,
          details: { 
            changes: analysis.files.totalChanges,
            threshold: validationRules.pr.maxSize,
            suggestion: 'Consider splitting this PR into smaller, focused changes'
          }
        });
      }

      // Check for too many files changed
      if (analysis.files.modified.length > validationRules.pr.maxFiles) {
        issues.push({
          type: IssueType.LARGE_PR,
          severity: IssueSeverity.MEDIUM,
          message: `PR modifies ${analysis.files.modified.length} files, consider reducing scope (max: ${validationRules.pr.maxFiles})`,
          details: {
            files_changed: analysis.files.modified.length,
            threshold: validationRules.pr.maxFiles
          }
        });
      }

      // Check for missing tests
      if (validationRules.pr.requireTests) {
        const hasTestChanges = analysis.files.modified.some(f => 
          f.filename.includes('test') || 
          f.filename.includes('spec') ||
          f.filename.includes('__tests__') ||
          f.filename.endsWith('.test.js') ||
          f.filename.endsWith('.test.ts') ||
          f.filename.endsWith('.spec.js') ||
          f.filename.endsWith('.spec.ts')
        );
        
        const hasCodeChanges = analysis.files.modified.some(f => 
          (f.filename.endsWith('.js') || 
           f.filename.endsWith('.ts') ||
           f.filename.endsWith('.jsx') ||
           f.filename.endsWith('.tsx')) &&
          !f.filename.includes('test') &&
          !f.filename.includes('spec') &&
          !f.filename.includes('config') &&
          !f.filename.includes('.d.ts')
        );

        if (hasCodeChanges && !hasTestChanges) {
          issues.push({
            type: IssueType.MISSING_TESTS,
            severity: IssueSeverity.HIGH,
            message: 'Code changes detected without corresponding test updates',
            details: { 
              code_files: analysis.files.modified.filter(f => 
                f.filename.endsWith('.js') || f.filename.endsWith('.ts')
              ).length,
              suggestion: 'Add tests for the new or modified functionality'
            }
          });
        }
      }

      // Check for potential security issues
      const securityIssues = this.detectSecurityIssues(analysis.files);
      issues.push(...securityIssues);

      // Check for breaking changes
      const breakingChanges = this.detectBreakingChanges(analysis.files);
      issues.push(...breakingChanges);

      // Check for performance issues
      const performanceIssues = this.detectPerformanceIssues(analysis.files);
      issues.push(...performanceIssues);

      // Check for code quality issues
      const qualityIssues = this.detectCodeQualityIssues(analysis.files);
      issues.push(...qualityIssues);

      // Check complexity
      if (analysis.complexity.score > validationRules.pr.complexityThreshold) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.MEDIUM,
          message: `High complexity detected (score: ${analysis.complexity.score})`,
          details: {
            complexity_score: analysis.complexity.score,
            threshold: validationRules.pr.complexityThreshold,
            suggestion: 'Consider refactoring complex functions or breaking them into smaller pieces'
          }
        });
      }

      log('info', `Detected ${issues.length} issues in PR analysis`, {
        critical: issues.filter(i => i.severity === IssueSeverity.CRITICAL).length,
        high: issues.filter(i => i.severity === IssueSeverity.HIGH).length,
        medium: issues.filter(i => i.severity === IssueSeverity.MEDIUM).length,
        low: issues.filter(i => i.severity === IssueSeverity.LOW).length
      });

      return issues;
    } catch (error) {
      log('error', 'Error detecting issues', { error: error.message });
      throw error;
    }
  }

  /**
   * Get PR files
   * @param {Object} pullRequest - GitHub PR object
   * @returns {Promise<Array>} Array of files
   */
  async getPRFiles(pullRequest) {
    try {
      const { data: files } = await this.octokit.pulls.listFiles({
        owner: pullRequest.base.repo.owner.login,
        repo: pullRequest.base.repo.name,
        pull_number: pullRequest.number,
        per_page: 100
      });

      return files;
    } catch (error) {
      log('error', 'Failed to get PR files', { error: error.message });
      throw error;
    }
  }

  /**
   * Get PR commits
   * @param {Object} pullRequest - GitHub PR object
   * @returns {Promise<Array>} Array of commits
   */
  async getPRCommits(pullRequest) {
    try {
      const { data: commits } = await this.octokit.pulls.listCommits({
        owner: pullRequest.base.repo.owner.login,
        repo: pullRequest.base.repo.name,
        pull_number: pullRequest.number,
        per_page: 100
      });

      return commits;
    } catch (error) {
      log('error', 'Failed to get PR commits', { error: error.message });
      throw error;
    }
  }

  /**
   * Get PR reviews
   * @param {Object} pullRequest - GitHub PR object
   * @returns {Promise<Array>} Array of reviews
   */
  async getPRReviews(pullRequest) {
    try {
      const { data: reviews } = await this.octokit.pulls.listReviews({
        owner: pullRequest.base.repo.owner.login,
        repo: pullRequest.base.repo.name,
        pull_number: pullRequest.number,
        per_page: 100
      });

      return reviews;
    } catch (error) {
      log('error', 'Failed to get PR reviews', { error: error.message });
      return []; // Reviews are optional, don't fail the analysis
    }
  }

  /**
   * Analyze files in the PR
   * @param {Array} files - Array of file objects
   * @returns {Object} File analysis results
   */
  analyzeFiles(files) {
    const analysis = {
      total: files.length,
      added: files.filter(f => f.status === 'added'),
      modified: files.filter(f => f.status === 'modified'),
      removed: files.filter(f => f.status === 'removed'),
      renamed: files.filter(f => f.status === 'renamed'),
      totalChanges: files.reduce((sum, f) => sum + f.changes, 0),
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      fileTypes: {},
      largeFiles: files.filter(f => f.changes > 100),
      binaryFiles: files.filter(f => f.filename.match(/\.(jpg|jpeg|png|gif|pdf|zip|tar|gz)$/i))
    };

    // Analyze file types
    files.forEach(file => {
      const ext = file.filename.split('.').pop()?.toLowerCase() || 'no-extension';
      analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;
    });

    return analysis;
  }

  /**
   * Analyze commits in the PR
   * @param {Array} commits - Array of commit objects
   * @returns {Object} Commit analysis results
   */
  analyzeCommits(commits) {
    return {
      total: commits.length,
      authors: [...new Set(commits.map(c => c.author?.login).filter(Boolean))],
      messages: commits.map(c => c.commit.message),
      averageMessageLength: commits.reduce((sum, c) => sum + c.commit.message.length, 0) / commits.length,
      hasConventionalCommits: commits.some(c => 
        /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/.test(c.commit.message)
      ),
      hasSignedCommits: commits.some(c => c.commit.verification?.verified)
    };
  }

  /**
   * Analyze reviews in the PR
   * @param {Array} reviews - Array of review objects
   * @returns {Object} Review analysis results
   */
  analyzeReviews(reviews) {
    return {
      total: reviews.length,
      approved: reviews.filter(r => r.state === 'APPROVED').length,
      changesRequested: reviews.filter(r => r.state === 'CHANGES_REQUESTED').length,
      commented: reviews.filter(r => r.state === 'COMMENTED').length,
      reviewers: [...new Set(reviews.map(r => r.user.login))],
      hasApproval: reviews.some(r => r.state === 'APPROVED')
    };
  }

  /**
   * Calculate complexity score
   * @param {Array} files - Array of file objects
   * @returns {Object} Complexity analysis
   */
  calculateComplexity(files) {
    let score = 0;
    let factors = [];

    // File count factor
    if (files.length > 10) {
      score += Math.min(files.length * 0.5, 10);
      factors.push(`Many files changed (${files.length})`);
    }

    // Large file factor
    const largeFiles = files.filter(f => f.changes > 100);
    if (largeFiles.length > 0) {
      score += largeFiles.length * 2;
      factors.push(`Large files (${largeFiles.length})`);
    }

    // Binary file factor
    const binaryFiles = files.filter(f => 
      f.filename.match(/\.(jpg|jpeg|png|gif|pdf|zip|tar|gz|exe|dll)$/i)
    );
    if (binaryFiles.length > 0) {
      score += binaryFiles.length * 1;
      factors.push(`Binary files (${binaryFiles.length})`);
    }

    // Configuration file factor
    const configFiles = files.filter(f => 
      f.filename.match(/\.(json|yml|yaml|xml|ini|conf|config)$/i) ||
      f.filename.includes('package.json') ||
      f.filename.includes('tsconfig') ||
      f.filename.includes('webpack') ||
      f.filename.includes('babel')
    );
    if (configFiles.length > 3) {
      score += 2;
      factors.push(`Many config files (${configFiles.length})`);
    }

    return {
      score: Math.round(score * 10) / 10,
      level: score < 5 ? 'low' : score < 10 ? 'medium' : 'high',
      factors
    };
  }

  /**
   * Calculate risk score
   * @param {Array} files - Array of file objects
   * @param {Array} commits - Array of commit objects
   * @returns {number} Risk score (0-10)
   */
  calculateRiskScore(files, commits) {
    let risk = 0;

    // Large change risk
    const totalChanges = files.reduce((sum, f) => sum + f.changes, 0);
    if (totalChanges > 500) risk += 3;
    else if (totalChanges > 200) risk += 2;
    else if (totalChanges > 100) risk += 1;

    // Critical file risk
    const criticalFiles = files.filter(f => 
      f.filename.includes('package.json') ||
      f.filename.includes('Dockerfile') ||
      f.filename.includes('docker-compose') ||
      f.filename.includes('.github/workflows') ||
      f.filename.includes('security') ||
      f.filename.includes('auth')
    );
    risk += criticalFiles.length * 0.5;

    // Multiple author risk
    const authors = [...new Set(commits.map(c => c.author?.login).filter(Boolean))];
    if (authors.length > 2) risk += 1;

    // No review risk
    if (commits.length > 5) risk += 1;

    return Math.min(Math.round(risk * 10) / 10, 10);
  }

  /**
   * Detect security issues
   * @param {Array} files - Array of file objects
   * @returns {Array} Array of security issues
   */
  detectSecurityIssues(files) {
    const issues = [];

    files.forEach(file => {
      if (file.patch) {
        securityPatterns.forEach(pattern => {
          const matches = file.patch.match(pattern.pattern);
          if (matches) {
            matches.forEach(match => {
              issues.push({
                type: IssueType.POTENTIAL_SECRET,
                severity: pattern.severity === 'critical' ? IssueSeverity.CRITICAL : IssueSeverity.HIGH,
                message: `Potential ${pattern.name} detected in code`,
                details: { 
                  file: file.filename,
                  pattern: pattern.name,
                  match: match.substring(0, 50) + '...',
                  suggestion: 'Remove hardcoded secrets and use environment variables or secret management'
                }
              });
            });
          }
        });

        // Check for blocked file types
        if (validationRules.pr.blockedFileTypes.some(ext => file.filename.endsWith(ext))) {
          issues.push({
            type: IssueType.SECURITY_VULNERABILITY,
            severity: IssueSeverity.HIGH,
            message: `Blocked file type detected: ${file.filename}`,
            details: {
              file: file.filename,
              suggestion: 'Remove sensitive files from the repository'
            }
          });
        }
      }
    });

    return issues;
  }

  /**
   * Detect breaking changes
   * @param {Array} files - Array of file objects
   * @returns {Array} Array of breaking change issues
   */
  detectBreakingChanges(files) {
    const issues = [];

    files.forEach(file => {
      if (file.patch && file.filename.match(/\.(js|ts|jsx|tsx)$/)) {
        // Check for removed exports
        const removedExports = file.patch.match(/-\s*export\s+(class|function|const|let|var)\s+\w+/g);
        if (removedExports) {
          issues.push({
            type: IssueType.BREAKING_CHANGE,
            severity: IssueSeverity.HIGH,
            message: `Potential breaking change: removed exports in ${file.filename}`,
            details: {
              file: file.filename,
              exports: removedExports.length,
              suggestion: 'Consider deprecation warnings before removing public APIs'
            }
          });
        }

        // Check for changed function signatures
        const changedSignatures = file.patch.match(/-\s*function\s+\w+\([^)]*\)/g);
        if (changedSignatures) {
          issues.push({
            type: IssueType.BREAKING_CHANGE,
            severity: IssueSeverity.MEDIUM,
            message: `Potential breaking change: modified function signatures in ${file.filename}`,
            details: {
              file: file.filename,
              functions: changedSignatures.length
            }
          });
        }
      }
    });

    return issues;
  }

  /**
   * Detect performance issues
   * @param {Array} files - Array of file objects
   * @returns {Array} Array of performance issues
   */
  detectPerformanceIssues(files) {
    const issues = [];

    files.forEach(file => {
      if (file.patch) {
        // Check for synchronous operations in async contexts
        if (file.patch.includes('fs.readFileSync') || file.patch.includes('fs.writeFileSync')) {
          issues.push({
            type: IssueType.PERFORMANCE_ISSUE,
            severity: IssueSeverity.MEDIUM,
            message: `Synchronous file operations detected in ${file.filename}`,
            details: {
              file: file.filename,
              suggestion: 'Use asynchronous file operations for better performance'
            }
          });
        }

        // Check for console.log in production code
        if (file.patch.includes('console.log') && !file.filename.includes('test')) {
          issues.push({
            type: IssueType.CODE_QUALITY,
            severity: IssueSeverity.LOW,
            message: `Console.log statements found in ${file.filename}`,
            details: {
              file: file.filename,
              suggestion: 'Use proper logging library instead of console.log'
            }
          });
        }
      }
    });

    return issues;
  }

  /**
   * Detect code quality issues
   * @param {Array} files - Array of file objects
   * @returns {Array} Array of code quality issues
   */
  detectCodeQualityIssues(files) {
    const issues = [];

    files.forEach(file => {
      if (file.patch) {
        // Check for TODO/FIXME comments
        const todos = file.patch.match(/\/\/\s*(TODO|FIXME|HACK)/gi);
        if (todos && todos.length > 2) {
          issues.push({
            type: IssueType.CODE_QUALITY,
            severity: IssueSeverity.LOW,
            message: `Multiple TODO/FIXME comments in ${file.filename}`,
            details: {
              file: file.filename,
              count: todos.length,
              suggestion: 'Consider creating issues for TODOs or fixing them'
            }
          });
        }

        // Check for long lines
        const longLines = file.patch.split('\n').filter(line => line.length > 120);
        if (longLines.length > 5) {
          issues.push({
            type: IssueType.CODE_QUALITY,
            severity: IssueSeverity.LOW,
            message: `Long lines detected in ${file.filename}`,
            details: {
              file: file.filename,
              count: longLines.length,
              suggestion: 'Consider breaking long lines for better readability'
            }
          });
        }
      }
    });

    return issues;
  }
}

export default PRAnalyzer;

