/**
 * Validation Reporter - Generates comprehensive validation reports
 * Formats and presents validation results in various formats
 */

import { log } from '../utils/simple_logger.js';

export class ValidationReporter {
  constructor(config) {
    this.config = config;
    this.reportFormats = config.reportFormats || ['json', 'markdown'];
    this.includeRawOutput = config.includeRawOutput !== false;
  }

  async generateReport(data) {
    log('info', `📋 Generating validation report for PR ${data.prDetails.prNumber}`);
    
    const report = {
      metadata: this.generateMetadata(data),
      summary: this.generateSummary(data),
      validation: this.formatValidationResults(data.validation),
      analysis: this.formatAnalysisResults(data.analysis),
      recommendations: this.generateRecommendations(data),
      details: this.generateDetailedResults(data)
    };

    // Generate reports in different formats
    const formattedReports = {};
    for (const format of this.reportFormats) {
      formattedReports[format] = await this.formatReport(report, format);
    }

    return {
      ...report,
      formatted: formattedReports,
      generatedAt: new Date()
    };
  }

  generateMetadata(data) {
    return {
      validationId: data.validationId,
      prNumber: data.prDetails.prNumber,
      prTitle: data.prDetails.title,
      prAuthor: data.prDetails.author,
      repository: data.prDetails.repository,
      branch: data.prDetails.headBranch,
      environment: data.environment,
      timestamp: data.timestamp,
      modifiedFiles: data.prDetails.modifiedFiles || [],
      fileCount: (data.prDetails.modifiedFiles || []).length
    };
  }

  generateSummary(data) {
    const summary = {
      status: 'unknown',
      overallScore: 0,
      validationPassed: false,
      analysisPassed: false,
      criticalIssues: 0,
      warnings: 0,
      suggestions: 0
    };

    // Process validation results
    if (data.validation && data.validation.success) {
      summary.validationPassed = true;
      summary.criticalIssues += (data.validation.issues || []).filter(issue => issue.severity === 'error').length;
      summary.warnings += (data.validation.issues || []).filter(issue => issue.severity === 'warning').length;
      summary.suggestions += (data.validation.suggestions || []).length;
    }

    // Process analysis results
    if (data.analysis && data.analysis.summary) {
      summary.analysisPassed = data.analysis.summary.overallScore >= 70;
      summary.overallScore = data.analysis.summary.overallScore;
      summary.criticalIssues += data.analysis.summary.criticalIssues || 0;
    }

    // Determine overall status
    if (summary.criticalIssues > 0) {
      summary.status = 'failed';
    } else if (summary.validationPassed && summary.analysisPassed) {
      summary.status = 'passed';
    } else if (summary.warnings > 0) {
      summary.status = 'passed_with_warnings';
    } else {
      summary.status = 'unknown';
    }

    return summary;
  }

  formatValidationResults(validation) {
    if (!validation) {
      return { error: 'No validation results available' };
    }

    if (!validation.success) {
      return {
        success: false,
        error: validation.error,
        rawOutput: this.includeRawOutput ? validation.rawOutput : undefined
      };
    }

    return {
      success: true,
      issues: this.categorizeIssues(validation.issues || []),
      suggestions: this.formatSuggestions(validation.suggestions || []),
      metrics: validation.metrics || {},
      summary: validation.summary || {},
      rawOutput: this.includeRawOutput ? validation.rawOutput : undefined
    };
  }

  formatAnalysisResults(analysis) {
    if (!analysis) {
      return { error: 'No analysis results available' };
    }

    if (analysis.error) {
      return {
        success: false,
        error: analysis.error
      };
    }

    return {
      success: true,
      metrics: this.formatAnalysisMetrics(analysis.metrics || {}),
      summary: analysis.summary || {},
      recommendations: analysis.recommendations || [],
      duration: analysis.duration,
      filesAnalyzed: (analysis.files || []).length
    };
  }

  categorizeIssues(issues) {
    const categorized = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    };

    for (const issue of issues) {
      const severity = issue.severity || 'medium';
      if (categorized[severity]) {
        categorized[severity].push({
          type: issue.type,
          message: issue.message,
          file: issue.file,
          line: issue.line,
          column: issue.column,
          rule: issue.rule
        });
      }
    }

    return categorized;
  }

  formatSuggestions(suggestions) {
    return suggestions.map(suggestion => ({
      type: suggestion.type || 'improvement',
      message: suggestion.message,
      file: suggestion.file,
      priority: suggestion.priority || 'medium',
      effort: suggestion.effort || 'unknown',
      impact: suggestion.impact || 'unknown'
    }));
  }

  formatAnalysisMetrics(metrics) {
    const formatted = {};

    // Format complexity metrics
    if (metrics.complexity) {
      formatted.complexity = {
        averageComplexity: metrics.complexity.averageComplexity,
        maxComplexity: metrics.complexity.maxComplexity,
        filesAnalyzed: metrics.complexity.analyzedFiles,
        highComplexityFiles: (metrics.complexity.issues || []).length,
        rating: this.getComplexityRating(metrics.complexity.averageComplexity)
      };
    }

    // Format coverage metrics
    if (metrics.coverage) {
      formatted.coverage = {
        overallCoverage: Math.round(metrics.coverage.overallCoverage * 100) / 100,
        lineCoverage: Math.round(metrics.coverage.lineCoverage * 100) / 100,
        branchCoverage: Math.round(metrics.coverage.branchCoverage * 100) / 100,
        functionCoverage: Math.round(metrics.coverage.functionCoverage * 100) / 100,
        uncoveredFiles: (metrics.coverage.uncoveredFiles || []).length,
        rating: this.getCoverageRating(metrics.coverage.overallCoverage)
      };
    }

    // Format security metrics
    if (metrics.security) {
      formatted.security = {
        riskLevel: metrics.security.riskLevel,
        securityScore: metrics.security.securityScore,
        vulnerabilities: this.categorizeVulnerabilities(metrics.security.vulnerabilities || []),
        totalVulnerabilities: (metrics.security.vulnerabilities || []).length
      };
    }

    // Format performance metrics
    if (metrics.performance) {
      formatted.performance = {
        performanceScore: metrics.performance.performanceScore,
        issues: (metrics.performance.performanceIssues || []).length,
        optimizations: (metrics.performance.optimizationOpportunities || []).length,
        rating: this.getPerformanceRating(metrics.performance.performanceScore)
      };
    }

    return formatted;
  }

  categorizeVulnerabilities(vulnerabilities) {
    const categorized = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    for (const vuln of vulnerabilities) {
      const severity = vuln.severity || 'medium';
      if (categorized[severity]) {
        categorized[severity].push({
          type: vuln.type,
          message: vuln.message,
          file: vuln.file,
          cwe: vuln.cwe,
          cvss: vuln.cvss
        });
      }
    }

    return categorized;
  }

  generateRecommendations(data) {
    const recommendations = [];

    // Add validation-based recommendations
    if (data.validation && data.validation.success) {
      const criticalIssues = (data.validation.issues || []).filter(issue => issue.severity === 'error');
      if (criticalIssues.length > 0) {
        recommendations.push({
          type: 'validation',
          priority: 'critical',
          title: 'Fix Critical Validation Issues',
          description: `Address ${criticalIssues.length} critical validation issues before merging`,
          action: 'Review and fix all critical validation errors',
          impact: 'Prevents potential runtime errors and maintains code quality'
        });
      }
    }

    // Add analysis-based recommendations
    if (data.analysis && data.analysis.recommendations) {
      for (const rec of data.analysis.recommendations) {
        recommendations.push({
          type: 'analysis',
          priority: rec.priority,
          title: this.getRecommendationTitle(rec.type),
          description: rec.message,
          action: this.getRecommendationAction(rec.type),
          impact: this.getRecommendationImpact(rec.type)
        });
      }
    }

    return recommendations.sort((a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority));
  }

  generateDetailedResults(data) {
    const details = {
      validation: {},
      analysis: {}
    };

    // Include detailed validation results
    if (data.validation) {
      details.validation = {
        claudeCodeOutput: this.includeRawOutput ? data.validation.rawOutput : undefined,
        issuesByFile: this.groupIssuesByFile(data.validation.issues || []),
        suggestionsByType: this.groupSuggestionsByType(data.validation.suggestions || [])
      };
    }

    // Include detailed analysis results
    if (data.analysis) {
      details.analysis = {
        metricDetails: data.analysis.metrics || {},
        fileAnalysis: this.generateFileAnalysisDetails(data.analysis),
        performanceProfile: this.generatePerformanceProfile(data.analysis)
      };
    }

    return details;
  }

  async formatReport(report, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'markdown':
        return this.generateMarkdownReport(report);
      case 'html':
        return this.generateHtmlReport(report);
      case 'text':
        return this.generateTextReport(report);
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  generateMarkdownReport(report) {
    const md = [];
    
    md.push(`# PR Validation Report`);
    md.push(`**PR #${report.metadata.prNumber}**: ${report.metadata.prTitle}`);
    md.push(`**Author**: ${report.metadata.prAuthor}`);
    md.push(`**Branch**: ${report.metadata.branch}`);
    md.push(`**Generated**: ${report.metadata.timestamp.toISOString()}`);
    md.push('');

    // Summary section
    md.push('## Summary');
    md.push(`- **Status**: ${this.getStatusEmoji(report.summary.status)} ${report.summary.status.toUpperCase()}`);
    md.push(`- **Overall Score**: ${report.summary.overallScore}/100`);
    md.push(`- **Files Modified**: ${report.metadata.fileCount}`);
    md.push(`- **Critical Issues**: ${report.summary.criticalIssues}`);
    md.push(`- **Warnings**: ${report.summary.warnings}`);
    md.push(`- **Suggestions**: ${report.summary.suggestions}`);
    md.push('');

    // Validation results
    if (report.validation.success) {
      md.push('## Validation Results ✅');
      if (report.validation.issues.critical.length > 0) {
        md.push('### Critical Issues');
        for (const issue of report.validation.issues.critical) {
          md.push(`- **${issue.file}**: ${issue.message}`);
        }
        md.push('');
      }
    } else {
      md.push('## Validation Results ❌');
      md.push(`**Error**: ${report.validation.error}`);
      md.push('');
    }

    // Analysis results
    if (report.analysis.success) {
      md.push('## Analysis Results 📊');
      
      if (report.analysis.metrics.complexity) {
        md.push('### Code Complexity');
        md.push(`- Average Complexity: ${report.analysis.metrics.complexity.averageComplexity}`);
        md.push(`- Rating: ${report.analysis.metrics.complexity.rating}`);
        md.push('');
      }

      if (report.analysis.metrics.coverage) {
        md.push('### Test Coverage');
        md.push(`- Overall Coverage: ${report.analysis.metrics.coverage.overallCoverage}%`);
        md.push(`- Rating: ${report.analysis.metrics.coverage.rating}`);
        md.push('');
      }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      md.push('## Recommendations 💡');
      for (const rec of report.recommendations) {
        md.push(`### ${this.getPriorityEmoji(rec.priority)} ${rec.title}`);
        md.push(`**Priority**: ${rec.priority.toUpperCase()}`);
        md.push(`**Description**: ${rec.description}`);
        md.push(`**Action**: ${rec.action}`);
        md.push('');
      }
    }

    return md.join('\n');
  }

  generateHtmlReport(report) {
    // Basic HTML report implementation
    return `
<!DOCTYPE html>
<html>
<head>
    <title>PR Validation Report - ${report.metadata.prNumber}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .status-passed { color: green; }
        .status-failed { color: red; }
        .status-warning { color: orange; }
        .metric { margin: 10px 0; }
        .recommendation { border-left: 3px solid #007cba; padding-left: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>PR Validation Report</h1>
    <h2>PR #${report.metadata.prNumber}: ${report.metadata.prTitle}</h2>
    <p><strong>Status:</strong> <span class="status-${report.summary.status}">${report.summary.status.toUpperCase()}</span></p>
    <p><strong>Score:</strong> ${report.summary.overallScore}/100</p>
    
    <h3>Summary</h3>
    <ul>
        <li>Files Modified: ${report.metadata.fileCount}</li>
        <li>Critical Issues: ${report.summary.criticalIssues}</li>
        <li>Warnings: ${report.summary.warnings}</li>
        <li>Suggestions: ${report.summary.suggestions}</li>
    </ul>
    
    ${report.recommendations.length > 0 ? `
    <h3>Recommendations</h3>
    ${report.recommendations.map(rec => `
        <div class="recommendation">
            <h4>${rec.title}</h4>
            <p><strong>Priority:</strong> ${rec.priority}</p>
            <p>${rec.description}</p>
        </div>
    `).join('')}
    ` : ''}
</body>
</html>`;
  }

  generateTextReport(report) {
    const lines = [];
    
    lines.push('PR VALIDATION REPORT');
    lines.push('===================');
    lines.push(`PR #${report.metadata.prNumber}: ${report.metadata.prTitle}`);
    lines.push(`Author: ${report.metadata.prAuthor}`);
    lines.push(`Status: ${report.summary.status.toUpperCase()}`);
    lines.push(`Score: ${report.summary.overallScore}/100`);
    lines.push('');
    
    lines.push('SUMMARY');
    lines.push('-------');
    lines.push(`Files Modified: ${report.metadata.fileCount}`);
    lines.push(`Critical Issues: ${report.summary.criticalIssues}`);
    lines.push(`Warnings: ${report.summary.warnings}`);
    lines.push(`Suggestions: ${report.summary.suggestions}`);
    lines.push('');
    
    if (report.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('---------------');
      for (const rec of report.recommendations) {
        lines.push(`${rec.priority.toUpperCase()}: ${rec.title}`);
        lines.push(`  ${rec.description}`);
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }

  // Helper methods
  getComplexityRating(complexity) {
    if (complexity <= 5) return 'Excellent';
    if (complexity <= 10) return 'Good';
    if (complexity <= 15) return 'Fair';
    return 'Poor';
  }

  getCoverageRating(coverage) {
    if (coverage >= 90) return 'Excellent';
    if (coverage >= 80) return 'Good';
    if (coverage >= 70) return 'Fair';
    return 'Poor';
  }

  getPerformanceRating(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Fair';
    return 'Poor';
  }

  getStatusEmoji(status) {
    const emojis = {
      passed: '✅',
      failed: '❌',
      passed_with_warnings: '⚠️',
      unknown: '❓'
    };
    return emojis[status] || '❓';
  }

  getPriorityEmoji(priority) {
    const emojis = {
      critical: '🚨',
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };
    return emojis[priority] || '🔵';
  }

  getPriorityWeight(priority) {
    const weights = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };
    return weights[priority] || 0;
  }

  getRecommendationTitle(type) {
    const titles = {
      complexity: 'Reduce Code Complexity',
      coverage: 'Improve Test Coverage',
      security: 'Fix Security Issues',
      performance: 'Optimize Performance',
      duplication: 'Reduce Code Duplication'
    };
    return titles[type] || 'Code Improvement';
  }

  getRecommendationAction(type) {
    const actions = {
      complexity: 'Refactor complex functions and break them into smaller, more manageable pieces',
      coverage: 'Add unit tests for uncovered code paths',
      security: 'Review and fix security vulnerabilities',
      performance: 'Optimize algorithms and data structures',
      duplication: 'Extract common code into reusable functions or modules'
    };
    return actions[type] || 'Review and improve code quality';
  }

  getRecommendationImpact(type) {
    const impacts = {
      complexity: 'Improves code maintainability and reduces bugs',
      coverage: 'Increases confidence in code changes and catches regressions',
      security: 'Prevents security vulnerabilities and data breaches',
      performance: 'Improves application speed and user experience',
      duplication: 'Reduces maintenance burden and improves consistency'
    };
    return impacts[type] || 'Improves overall code quality';
  }

  groupIssuesByFile(issues) {
    const grouped = {};
    for (const issue of issues) {
      if (!grouped[issue.file]) {
        grouped[issue.file] = [];
      }
      grouped[issue.file].push(issue);
    }
    return grouped;
  }

  groupSuggestionsByType(suggestions) {
    const grouped = {};
    for (const suggestion of suggestions) {
      if (!grouped[suggestion.type]) {
        grouped[suggestion.type] = [];
      }
      grouped[suggestion.type].push(suggestion);
    }
    return grouped;
  }

  generateFileAnalysisDetails(analysis) {
    // Generate detailed file-by-file analysis
    return {
      totalFiles: (analysis.files || []).length,
      fileMetrics: analysis.files || []
    };
  }

  generatePerformanceProfile(analysis) {
    // Generate performance profiling information
    return {
      analysisTime: analysis.duration,
      metricsGenerated: Object.keys(analysis.metrics || {}).length
    };
  }
}

