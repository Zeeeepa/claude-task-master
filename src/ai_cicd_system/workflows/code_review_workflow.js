/**
 * Code Review Workflow - Automated code review using Claude Code
 * Provides intelligent code review suggestions and feedback
 */

import { log } from '../utils/simple_logger.js';
import { ClaudeCodeIntegrator } from '../integrations/claude_code_integrator.js';

export class CodeReviewWorkflow {
  constructor(config = {}) {
    this.config = {
      reviewDepth: config.reviewDepth || 'standard', // 'quick', 'standard', 'thorough'
      focusAreas: config.focusAreas || ['security', 'performance', 'maintainability'],
      generateSuggestions: config.generateSuggestions !== false,
      includeExamples: config.includeExamples !== false,
      maxReviewTime: config.maxReviewTime || 300000, // 5 minutes
      ...config
    };
    
    this.claudeCodeIntegrator = new ClaudeCodeIntegrator(this.config);
    this.isInitialized = false;
    this.activeReviews = new Map();
  }

  async initialize() {
    log('info', '🔧 Initializing code review workflow...');
    
    try {
      await this.claudeCodeIntegrator.initialize();
      this.isInitialized = true;
      log('info', '✅ Code review workflow initialized');
    } catch (error) {
      log('error', `❌ Failed to initialize code review workflow: ${error.message}`);
      throw error;
    }
  }

  async reviewPR(prDetails, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Code review workflow not initialized. Call initialize() first.');
    }

    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    log('info', `👁️ Starting code review: ${prDetails.prNumber} (${reviewId})`);
    
    const review = {
      id: reviewId,
      prNumber: prDetails.prNumber,
      startTime: new Date(),
      status: 'initializing',
      focusAreas: options.focusAreas || this.config.focusAreas,
      depth: options.reviewDepth || this.config.reviewDepth,
      result: null
    };

    this.activeReviews.set(reviewId, review);

    try {
      // Step 1: Analyze PR structure and changes
      review.status = 'analyzing_structure';
      const structureAnalysis = await this.analyzePRStructure(prDetails, options);
      
      // Step 2: Perform focused code review
      review.status = 'reviewing_code';
      const codeReview = await this.performCodeReview(prDetails, structureAnalysis, options);
      
      // Step 3: Generate review comments and suggestions
      review.status = 'generating_feedback';
      const feedback = await this.generateReviewFeedback(codeReview, prDetails, options);
      
      // Step 4: Compile final review
      review.status = 'compiling_review';
      const finalReview = await this.compileFinalReview(structureAnalysis, codeReview, feedback, prDetails);
      
      review.result = finalReview;
      review.status = 'completed';
      review.endTime = new Date();
      review.duration = review.endTime - review.startTime;
      
      log('info', `✅ Code review completed: ${prDetails.prNumber} in ${review.duration}ms`);
      
      return finalReview;
      
    } catch (error) {
      review.status = 'failed';
      review.error = error.message;
      review.endTime = new Date();
      
      log('error', `❌ Code review failed: ${prDetails.prNumber} - ${error.message}`);
      throw error;
    } finally {
      this.activeReviews.delete(reviewId);
    }
  }

  async analyzePRStructure(prDetails, options) {
    log('info', `📊 Analyzing PR structure for ${prDetails.prNumber}`);
    
    const analysis = {
      fileCount: (prDetails.modifiedFiles || []).length,
      fileTypes: {},
      changeComplexity: 'unknown',
      riskLevel: 'low',
      reviewPriority: [],
      estimatedReviewTime: 0
    };

    try {
      // Analyze file types and distribution
      for (const file of prDetails.modifiedFiles || []) {
        const extension = this.getFileExtension(file);
        analysis.fileTypes[extension] = (analysis.fileTypes[extension] || 0) + 1;
      }
      
      // Determine change complexity
      analysis.changeComplexity = this.assessChangeComplexity(prDetails);
      
      // Calculate risk level
      analysis.riskLevel = this.calculateRiskLevel(prDetails, analysis);
      
      // Prioritize files for review
      analysis.reviewPriority = this.prioritizeFilesForReview(prDetails.modifiedFiles || []);
      
      // Estimate review time
      analysis.estimatedReviewTime = this.estimateReviewTime(analysis);
      
      log('info', `📊 Structure analysis completed: ${analysis.fileCount} files, ${analysis.changeComplexity} complexity`);
      
      return analysis;
      
    } catch (error) {
      log('error', `Structure analysis failed: ${error.message}`);
      throw error;
    }
  }

  async performCodeReview(prDetails, structureAnalysis, options) {
    log('info', `🔍 Performing code review for ${prDetails.prNumber}`);
    
    const codeReview = {
      overallAssessment: {},
      fileReviews: [],
      focusAreaResults: {},
      suggestions: [],
      issues: []
    };

    try {
      // Review files in priority order
      for (const file of structureAnalysis.reviewPriority) {
        const fileReview = await this.reviewFile(file, prDetails, options);
        codeReview.fileReviews.push(fileReview);
        
        // Aggregate issues and suggestions
        codeReview.issues.push(...fileReview.issues);
        codeReview.suggestions.push(...fileReview.suggestions);
      }
      
      // Perform focus area analysis
      for (const focusArea of this.config.focusAreas) {
        codeReview.focusAreaResults[focusArea] = await this.analyzeFocusArea(
          focusArea, 
          prDetails, 
          codeReview.fileReviews
        );
      }
      
      // Generate overall assessment
      codeReview.overallAssessment = this.generateOverallAssessment(codeReview);
      
      log('info', `🔍 Code review completed: ${codeReview.issues.length} issues, ${codeReview.suggestions.length} suggestions`);
      
      return codeReview;
      
    } catch (error) {
      log('error', `Code review failed: ${error.message}`);
      throw error;
    }
  }

  async reviewFile(file, prDetails, options) {
    log('debug', `📄 Reviewing file: ${file}`);
    
    const fileReview = {
      file,
      reviewTime: new Date(),
      issues: [],
      suggestions: [],
      metrics: {},
      rating: 'unknown'
    };

    try {
      // Use Claude Code to analyze the file
      const environment = await this.claudeCodeIntegrator.createValidationEnvironment(prDetails);
      
      // Get file-specific analysis
      const analysis = await this.claudeCodeIntegrator.codeAnalyzer.analyzeCode({
        environment,
        files: [file],
        metrics: this.config.focusAreas
      });
      
      // Extract issues and suggestions for this file
      if (analysis.metrics) {
        fileReview.metrics = analysis.metrics;
        fileReview.issues = this.extractFileIssues(analysis, file);
        fileReview.suggestions = this.extractFileSuggestions(analysis, file);
      }
      
      // Calculate file rating
      fileReview.rating = this.calculateFileRating(fileReview);
      
      // Cleanup environment
      await this.claudeCodeIntegrator.cleanupEnvironment(environment);
      
      return fileReview;
      
    } catch (error) {
      fileReview.error = error.message;
      log('warn', `Failed to review file ${file}: ${error.message}`);
      return fileReview;
    }
  }

  async analyzeFocusArea(focusArea, prDetails, fileReviews) {
    log('debug', `🎯 Analyzing focus area: ${focusArea}`);
    
    const analysis = {
      focusArea,
      score: 0,
      issues: [],
      recommendations: [],
      summary: ''
    };

    try {
      switch (focusArea) {
        case 'security':
          analysis = await this.analyzeSecurityFocus(fileReviews, prDetails);
          break;
        case 'performance':
          analysis = await this.analyzePerformanceFocus(fileReviews, prDetails);
          break;
        case 'maintainability':
          analysis = await this.analyzeMaintainabilityFocus(fileReviews, prDetails);
          break;
        case 'testing':
          analysis = await this.analyzeTestingFocus(fileReviews, prDetails);
          break;
        default:
          analysis = await this.analyzeGenericFocus(focusArea, fileReviews, prDetails);
      }
      
      return analysis;
      
    } catch (error) {
      analysis.error = error.message;
      return analysis;
    }
  }

  async generateReviewFeedback(codeReview, prDetails, options) {
    log('info', `💬 Generating review feedback for ${prDetails.prNumber}`);
    
    const feedback = {
      summary: '',
      overallRating: 'unknown',
      approvalStatus: 'pending',
      comments: [],
      actionItems: [],
      positiveAspects: []
    };

    try {
      // Generate summary
      feedback.summary = this.generateReviewSummary(codeReview, prDetails);
      
      // Calculate overall rating
      feedback.overallRating = this.calculateOverallRating(codeReview);
      
      // Determine approval status
      feedback.approvalStatus = this.determineApprovalStatus(codeReview);
      
      // Generate specific comments
      feedback.comments = this.generateReviewComments(codeReview, prDetails);
      
      // Create action items
      feedback.actionItems = this.generateActionItems(codeReview);
      
      // Identify positive aspects
      feedback.positiveAspects = this.identifyPositiveAspects(codeReview);
      
      return feedback;
      
    } catch (error) {
      log('error', `Failed to generate review feedback: ${error.message}`);
      throw error;
    }
  }

  async compileFinalReview(structureAnalysis, codeReview, feedback, prDetails) {
    log('info', `📋 Compiling final review for ${prDetails.prNumber}`);
    
    return {
      reviewId: `review_${Date.now()}`,
      prDetails: {
        number: prDetails.prNumber,
        title: prDetails.title,
        author: prDetails.author,
        branch: prDetails.headBranch
      },
      structure: structureAnalysis,
      codeReview,
      feedback,
      metadata: {
        reviewedAt: new Date(),
        reviewDepth: this.config.reviewDepth,
        focusAreas: this.config.focusAreas,
        reviewerVersion: '1.0.0'
      },
      summary: {
        filesReviewed: codeReview.fileReviews.length,
        issuesFound: codeReview.issues.length,
        suggestionsGenerated: codeReview.suggestions.length,
        overallRating: feedback.overallRating,
        approvalStatus: feedback.approvalStatus,
        estimatedFixTime: this.estimateFixTime(codeReview.issues)
      }
    };
  }

  // Helper methods for analysis
  getFileExtension(file) {
    return file.substring(file.lastIndexOf('.')) || 'unknown';
  }

  assessChangeComplexity(prDetails) {
    const fileCount = (prDetails.modifiedFiles || []).length;
    const linesChanged = prDetails.additions + prDetails.deletions || 0;
    
    if (fileCount > 20 || linesChanged > 1000) return 'high';
    if (fileCount > 10 || linesChanged > 500) return 'medium';
    return 'low';
  }

  calculateRiskLevel(prDetails, analysis) {
    let riskScore = 0;
    
    // File count risk
    if (analysis.fileCount > 15) riskScore += 2;
    else if (analysis.fileCount > 5) riskScore += 1;
    
    // Critical file risk
    const criticalFiles = (prDetails.modifiedFiles || []).filter(file => 
      file.includes('config') || file.includes('security') || file.includes('auth')
    );
    riskScore += criticalFiles.length;
    
    // Change complexity risk
    if (analysis.changeComplexity === 'high') riskScore += 2;
    else if (analysis.changeComplexity === 'medium') riskScore += 1;
    
    if (riskScore >= 4) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  prioritizeFilesForReview(files) {
    return files.sort((a, b) => {
      const priorityA = this.getFilePriority(a);
      const priorityB = this.getFilePriority(b);
      return priorityB - priorityA;
    });
  }

  getFilePriority(file) {
    let priority = 0;
    
    // Critical files get highest priority
    if (file.includes('security') || file.includes('auth')) priority += 10;
    if (file.includes('config') || file.includes('env')) priority += 8;
    if (file.includes('api') || file.includes('service')) priority += 6;
    
    // Code files get higher priority than tests
    if (file.includes('.test.') || file.includes('.spec.')) priority -= 2;
    
    // Core business logic files
    if (file.includes('core') || file.includes('main')) priority += 4;
    
    return priority;
  }

  estimateReviewTime(analysis) {
    const baseTime = 2; // 2 minutes per file
    const complexityMultiplier = {
      low: 1,
      medium: 1.5,
      high: 2
    };
    
    return analysis.fileCount * baseTime * (complexityMultiplier[analysis.changeComplexity] || 1);
  }

  extractFileIssues(analysis, file) {
    const issues = [];
    
    // Extract issues from different metrics
    if (analysis.metrics.security?.vulnerabilities) {
      for (const vuln of analysis.metrics.security.vulnerabilities) {
        if (vuln.file === file) {
          issues.push({
            type: 'security',
            severity: vuln.severity,
            message: vuln.message,
            line: vuln.line,
            file
          });
        }
      }
    }
    
    if (analysis.metrics.complexity?.issues) {
      for (const issue of analysis.metrics.complexity.issues) {
        if (issue.file === file) {
          issues.push({
            type: 'complexity',
            severity: 'warning',
            message: issue.message,
            file
          });
        }
      }
    }
    
    return issues;
  }

  extractFileSuggestions(analysis, file) {
    const suggestions = [];
    
    // Extract suggestions from analysis recommendations
    if (analysis.recommendations) {
      for (const rec of analysis.recommendations) {
        if (rec.files?.includes(file)) {
          suggestions.push({
            type: rec.type,
            priority: rec.priority,
            message: rec.message,
            file
          });
        }
      }
    }
    
    return suggestions;
  }

  calculateFileRating(fileReview) {
    let score = 100;
    
    // Deduct points for issues
    score -= fileReview.issues.filter(i => i.severity === 'error').length * 20;
    score -= fileReview.issues.filter(i => i.severity === 'warning').length * 10;
    score -= fileReview.issues.filter(i => i.severity === 'info').length * 5;
    
    // Bonus for good practices
    if (fileReview.suggestions.length === 0) score += 10;
    
    if (score >= 90) return 'excellent';
    if (score >= 80) return 'good';
    if (score >= 70) return 'fair';
    if (score >= 60) return 'poor';
    return 'critical';
  }

  async analyzeSecurityFocus(fileReviews, prDetails) {
    const securityIssues = fileReviews.flatMap(review => 
      review.issues.filter(issue => issue.type === 'security')
    );
    
    return {
      focusArea: 'security',
      score: Math.max(0, 100 - (securityIssues.length * 15)),
      issues: securityIssues,
      recommendations: this.generateSecurityRecommendations(securityIssues),
      summary: `Found ${securityIssues.length} security issues`
    };
  }

  async analyzePerformanceFocus(fileReviews, prDetails) {
    const performanceIssues = fileReviews.flatMap(review => 
      review.issues.filter(issue => issue.type === 'performance')
    );
    
    return {
      focusArea: 'performance',
      score: Math.max(0, 100 - (performanceIssues.length * 10)),
      issues: performanceIssues,
      recommendations: this.generatePerformanceRecommendations(performanceIssues),
      summary: `Found ${performanceIssues.length} performance issues`
    };
  }

  async analyzeMaintainabilityFocus(fileReviews, prDetails) {
    const complexityIssues = fileReviews.flatMap(review => 
      review.issues.filter(issue => issue.type === 'complexity')
    );
    
    return {
      focusArea: 'maintainability',
      score: Math.max(0, 100 - (complexityIssues.length * 8)),
      issues: complexityIssues,
      recommendations: this.generateMaintainabilityRecommendations(complexityIssues),
      summary: `Found ${complexityIssues.length} maintainability issues`
    };
  }

  async analyzeTestingFocus(fileReviews, prDetails) {
    const testFiles = (prDetails.modifiedFiles || []).filter(file => 
      file.includes('.test.') || file.includes('.spec.')
    );
    
    const codeFiles = (prDetails.modifiedFiles || []).filter(file => 
      !file.includes('.test.') && !file.includes('.spec.')
    );
    
    const testCoverage = testFiles.length / Math.max(1, codeFiles.length) * 100;
    
    return {
      focusArea: 'testing',
      score: Math.min(100, testCoverage),
      issues: testCoverage < 50 ? [{ type: 'testing', message: 'Low test coverage' }] : [],
      recommendations: this.generateTestingRecommendations(testCoverage),
      summary: `Test coverage: ${testCoverage.toFixed(1)}%`
    };
  }

  async analyzeGenericFocus(focusArea, fileReviews, prDetails) {
    return {
      focusArea,
      score: 75, // Default score
      issues: [],
      recommendations: [],
      summary: `Generic analysis for ${focusArea}`
    };
  }

  generateReviewSummary(codeReview, prDetails) {
    const totalIssues = codeReview.issues.length;
    const criticalIssues = codeReview.issues.filter(i => i.severity === 'error').length;
    const suggestions = codeReview.suggestions.length;
    
    return `Reviewed ${codeReview.fileReviews.length} files. Found ${totalIssues} issues (${criticalIssues} critical) and generated ${suggestions} suggestions for improvement.`;
  }

  calculateOverallRating(codeReview) {
    const criticalIssues = codeReview.issues.filter(i => i.severity === 'error').length;
    const warnings = codeReview.issues.filter(i => i.severity === 'warning').length;
    
    if (criticalIssues > 0) return 'needs_work';
    if (warnings > 5) return 'fair';
    if (warnings > 0) return 'good';
    return 'excellent';
  }

  determineApprovalStatus(codeReview) {
    const criticalIssues = codeReview.issues.filter(i => i.severity === 'error').length;
    const securityIssues = codeReview.issues.filter(i => i.type === 'security').length;
    
    if (criticalIssues > 0 || securityIssues > 0) return 'request_changes';
    if (codeReview.issues.length > 10) return 'comment';
    return 'approve';
  }

  generateReviewComments(codeReview, prDetails) {
    const comments = [];
    
    // Group issues by file
    const issuesByFile = {};
    for (const issue of codeReview.issues) {
      if (!issuesByFile[issue.file]) {
        issuesByFile[issue.file] = [];
      }
      issuesByFile[issue.file].push(issue);
    }
    
    // Generate comments for each file
    for (const [file, issues] of Object.entries(issuesByFile)) {
      comments.push({
        file,
        line: issues[0].line || 1,
        message: this.formatFileComment(file, issues)
      });
    }
    
    return comments;
  }

  formatFileComment(file, issues) {
    const lines = [`**Issues found in ${file}:**`];
    
    for (const issue of issues) {
      const emoji = issue.severity === 'error' ? '🚨' : '⚠️';
      lines.push(`${emoji} ${issue.message}`);
    }
    
    return lines.join('\n');
  }

  generateActionItems(codeReview) {
    const actionItems = [];
    
    const criticalIssues = codeReview.issues.filter(i => i.severity === 'error');
    if (criticalIssues.length > 0) {
      actionItems.push({
        priority: 'high',
        title: 'Fix Critical Issues',
        description: `Address ${criticalIssues.length} critical issues before merging`,
        estimatedTime: criticalIssues.length * 30 // 30 minutes per critical issue
      });
    }
    
    const securityIssues = codeReview.issues.filter(i => i.type === 'security');
    if (securityIssues.length > 0) {
      actionItems.push({
        priority: 'high',
        title: 'Address Security Concerns',
        description: `Review and fix ${securityIssues.length} security issues`,
        estimatedTime: securityIssues.length * 45 // 45 minutes per security issue
      });
    }
    
    return actionItems;
  }

  identifyPositiveAspects(codeReview) {
    const positives = [];
    
    const excellentFiles = codeReview.fileReviews.filter(r => r.rating === 'excellent');
    if (excellentFiles.length > 0) {
      positives.push(`${excellentFiles.length} files demonstrate excellent code quality`);
    }
    
    if (codeReview.issues.filter(i => i.type === 'security').length === 0) {
      positives.push('No security vulnerabilities detected');
    }
    
    if (codeReview.suggestions.length < 5) {
      positives.push('Code follows best practices with minimal suggestions');
    }
    
    return positives;
  }

  estimateFixTime(issues) {
    const timeEstimates = {
      error: 45, // 45 minutes per critical issue
      warning: 20, // 20 minutes per warning
      info: 10 // 10 minutes per info issue
    };
    
    return issues.reduce((total, issue) => {
      return total + (timeEstimates[issue.severity] || 15);
    }, 0);
  }

  // Recommendation generators
  generateSecurityRecommendations(issues) {
    if (issues.length === 0) return ['Continue following security best practices'];
    
    return [
      'Review and fix all security vulnerabilities immediately',
      'Consider implementing additional security testing',
      'Review security guidelines and coding standards'
    ];
  }

  generatePerformanceRecommendations(issues) {
    if (issues.length === 0) return ['Performance looks good'];
    
    return [
      'Optimize identified performance bottlenecks',
      'Consider adding performance tests',
      'Review algorithms and data structures for efficiency'
    ];
  }

  generateMaintainabilityRecommendations(issues) {
    if (issues.length === 0) return ['Code is well-structured and maintainable'];
    
    return [
      'Refactor complex functions to improve readability',
      'Add documentation for complex logic',
      'Consider breaking large files into smaller modules'
    ];
  }

  generateTestingRecommendations(coverage) {
    if (coverage >= 80) return ['Test coverage is excellent'];
    if (coverage >= 60) return ['Consider adding more tests for better coverage'];
    
    return [
      'Significantly increase test coverage',
      'Add unit tests for all new functionality',
      'Consider implementing integration tests'
    ];
  }

  // Status and monitoring
  getActiveReviews() {
    return Array.from(this.activeReviews.values());
  }

  async shutdown() {
    log('info', '🛑 Shutting down code review workflow...');
    
    // Cancel active reviews
    for (const [reviewId, review] of this.activeReviews) {
      review.status = 'cancelled';
      this.activeReviews.delete(reviewId);
    }
    
    await this.claudeCodeIntegrator.shutdown();
    this.isInitialized = false;
    
    log('info', '✅ Code review workflow shutdown complete');
  }
}

