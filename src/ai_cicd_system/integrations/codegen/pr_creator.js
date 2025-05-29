/**
 * @fileoverview PR Generation and Formatting
 * @description Advanced PR creation and formatting for Codegen-generated code
 */

import { log } from '../../utils/simple_logger.js';

/**
 * PR Creator for formatting and managing Codegen-generated PRs
 */
export class PRCreator {
  constructor(config = {}) {
    this.config = {
      defaultBranch: config.defaultBranch || 'main',
      branchPrefix: config.branchPrefix || 'codegen/',
      includeMetadata: config.includeMetadata !== false,
      autoAssignReviewers: config.autoAssignReviewers || false,
      defaultReviewers: config.defaultReviewers || [],
      templateVersion: config.templateVersion || '1.0'
    };
    
    // PR templates for different types
    this.templates = {
      feature: {
        title: 'feat: {description}',
        labels: ['feature', 'codegen'],
        sections: ['summary', 'changes', 'testing', 'checklist']
      },
      bugfix: {
        title: 'fix: {description}',
        labels: ['bugfix', 'codegen'],
        sections: ['summary', 'problem', 'solution', 'testing', 'checklist']
      },
      refactor: {
        title: 'refactor: {description}',
        labels: ['refactor', 'codegen'],
        sections: ['summary', 'changes', 'improvements', 'testing', 'checklist']
      },
      docs: {
        title: 'docs: {description}',
        labels: ['documentation', 'codegen'],
        sections: ['summary', 'changes', 'checklist']
      },
      chore: {
        title: 'chore: {description}',
        labels: ['chore', 'codegen'],
        sections: ['summary', 'changes', 'checklist']
      }
    };
    
    log('debug', 'PRCreator initialized', { config: this.config });
  }

  /**
   * Create a formatted PR from Codegen result
   * @param {Object} codegenResult - Result from Codegen API
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} PR creation data
   */
  async createPR(codegenResult, analysis, context = {}) {
    try {
      log('info', `Creating PR for task: ${analysis.originalDescription.substring(0, 100)}...`);
      
      // Determine PR type
      const prType = this._determinePRType(analysis);
      const template = this.templates[prType];
      
      // Generate PR data
      const prData = {
        title: this._generateTitle(analysis, template),
        body: await this._generateBody(codegenResult, analysis, context, template),
        head: this._generateBranchName(analysis, context),
        base: context.baseBranch || this.config.defaultBranch,
        labels: this._generateLabels(analysis, template),
        assignees: this._generateAssignees(context),
        reviewers: this._generateReviewers(context),
        metadata: {
          codegenTaskId: codegenResult.taskId,
          analysisId: analysis.timestamp,
          prType,
          template: template,
          createdAt: new Date().toISOString()
        }
      };
      
      // Add draft status for complex changes
      if (analysis.complexity.level === 'complex' || analysis.riskFactors.length > 0) {
        prData.draft = true;
      }
      
      log('info', `PR data generated successfully`, {
        title: prData.title,
        type: prType,
        complexity: analysis.complexity.level,
        isDraft: prData.draft || false
      });
      
      return prData;
      
    } catch (error) {
      log('error', `PR creation failed: ${error.message}`);
      throw new Error(`PR creation failed: ${error.message}`);
    }
  }

  /**
   * Generate PR title
   * @param {Object} analysis - Task analysis
   * @param {Object} template - PR template
   * @returns {string} PR title
   * @private
   */
  _generateTitle(analysis, template) {
    const description = this._extractTitleDescription(analysis.originalDescription);
    return template.title.replace('{description}', description);
  }

  /**
   * Generate PR body
   * @param {Object} codegenResult - Codegen result
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @param {Object} template - PR template
   * @returns {Promise<string>} PR body
   * @private
   */
  async _generateBody(codegenResult, analysis, context, template) {
    let body = '';
    
    // Add sections based on template
    for (const section of template.sections) {
      const sectionContent = await this._generateSection(section, codegenResult, analysis, context);
      if (sectionContent) {
        body += sectionContent + '\n\n';
      }
    }
    
    // Add metadata if enabled
    if (this.config.includeMetadata) {
      body += this._generateMetadataSection(codegenResult, analysis);
    }
    
    return body.trim();
  }

  /**
   * Generate specific section content
   * @param {string} section - Section type
   * @param {Object} codegenResult - Codegen result
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {Promise<string>} Section content
   * @private
   */
  async _generateSection(section, codegenResult, analysis, context) {
    switch (section) {
      case 'summary':
        return this._generateSummarySection(analysis, context);
      
      case 'changes':
        return this._generateChangesSection(codegenResult, analysis);
      
      case 'problem':
        return this._generateProblemSection(analysis);
      
      case 'solution':
        return this._generateSolutionSection(codegenResult, analysis);
      
      case 'improvements':
        return this._generateImprovementsSection(analysis);
      
      case 'testing':
        return this._generateTestingSection(analysis, context);
      
      case 'checklist':
        return this._generateChecklistSection(analysis);
      
      default:
        return null;
    }
  }

  /**
   * Generate summary section
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {string} Summary section
   * @private
   */
  _generateSummarySection(analysis, context) {
    let content = '## Summary\n\n';
    content += `${analysis.originalDescription}\n\n`;
    
    if (analysis.intent.primary !== 'unknown') {
      content += `**Intent**: ${analysis.intent.description}\n`;
    }
    
    if (analysis.complexity.level !== 'simple') {
      content += `**Complexity**: ${analysis.complexity.level}\n`;
    }
    
    if (analysis.estimatedEffort.estimatedHours > 1) {
      content += `**Estimated Effort**: ${analysis.estimatedEffort.estimatedHours} hours\n`;
    }
    
    return content;
  }

  /**
   * Generate changes section
   * @param {Object} codegenResult - Codegen result
   * @param {Object} analysis - Task analysis
   * @returns {string} Changes section
   * @private
   */
  _generateChangesSection(codegenResult, analysis) {
    let content = '## Changes\n\n';
    
    // Add high-level changes
    if (analysis.scope.affectedAreas.length > 0) {
      content += '**Affected Areas**:\n';
      analysis.scope.affectedAreas.forEach(area => {
        content += `- ${area}\n`;
      });
      content += '\n';
    }
    
    // Add file changes if available
    if (codegenResult.files && codegenResult.files.length > 0) {
      content += '**Files Modified**:\n';
      codegenResult.files.forEach(file => {
        content += `- \`${file.path}\`: ${file.description || 'Modified'}\n`;
      });
      content += '\n';
    }
    
    // Add technology changes
    if (analysis.technologies.languages.length > 0) {
      content += '**Technologies**:\n';
      content += `- Languages: ${analysis.technologies.languages.join(', ')}\n`;
      
      if (analysis.technologies.frameworks.length > 0) {
        content += `- Frameworks: ${analysis.technologies.frameworks.join(', ')}\n`;
      }
      
      if (analysis.dependencies.length > 0) {
        content += `- Dependencies: ${analysis.dependencies.join(', ')}\n`;
      }
    }
    
    return content;
  }

  /**
   * Generate problem section
   * @param {Object} analysis - Task analysis
   * @returns {string} Problem section
   * @private
   */
  _generateProblemSection(analysis) {
    let content = '## Problem\n\n';
    content += `${analysis.originalDescription}\n\n`;
    
    if (analysis.riskFactors.length > 0) {
      content += '**Risk Factors**:\n';
      analysis.riskFactors.forEach(risk => {
        content += `- ${risk}\n`;
      });
    }
    
    return content;
  }

  /**
   * Generate solution section
   * @param {Object} codegenResult - Codegen result
   * @param {Object} analysis - Task analysis
   * @returns {string} Solution section
   * @private
   */
  _generateSolutionSection(codegenResult, analysis) {
    let content = '## Solution\n\n';
    
    // Add approach description
    content += 'This PR implements the requested changes using the following approach:\n\n';
    
    if (analysis.requirements.functional.length > 0) {
      content += '**Requirements Addressed**:\n';
      analysis.requirements.functional.forEach(req => {
        content += `- ${req}\n`;
      });
      content += '\n';
    }
    
    // Add implementation details if available
    if (codegenResult.implementation) {
      content += '**Implementation Details**:\n';
      content += `${codegenResult.implementation}\n\n`;
    }
    
    return content;
  }

  /**
   * Generate improvements section
   * @param {Object} analysis - Task analysis
   * @returns {string} Improvements section
   * @private
   */
  _generateImprovementsSection(analysis) {
    let content = '## Improvements\n\n';
    
    content += 'This refactoring provides the following improvements:\n\n';
    
    // Add specific improvements based on analysis
    if (analysis.intent.primary === 'refactor') {
      content += '- Improved code structure and readability\n';
      content += '- Better maintainability\n';
      content += '- Enhanced performance\n';
    }
    
    if (analysis.technologies.languages.includes('typescript')) {
      content += '- Better type safety\n';
    }
    
    return content;
  }

  /**
   * Generate testing section
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {string} Testing section
   * @private
   */
  _generateTestingSection(analysis, context) {
    let content = '## Testing\n\n';
    
    // Add testing checklist
    content += '### Testing Checklist\n\n';
    content += '- [ ] Unit tests added/updated\n';
    content += '- [ ] Integration tests verified\n';
    content += '- [ ] Manual testing completed\n';
    
    // Add specific testing notes based on complexity
    if (analysis.complexity.level !== 'simple') {
      content += '- [ ] Edge cases tested\n';
      content += '- [ ] Error handling verified\n';
    }
    
    // Add security testing for auth-related changes
    if (analysis.technologies.technical.includes('authentication')) {
      content += '- [ ] Security testing completed\n';
    }
    
    // Add performance testing for optimization changes
    if (analysis.intent.primary === 'refactor' || /performance|optimize/i.test(analysis.originalDescription)) {
      content += '- [ ] Performance impact measured\n';
    }
    
    return content;
  }

  /**
   * Generate checklist section
   * @param {Object} analysis - Task analysis
   * @returns {string} Checklist section
   * @private
   */
  _generateChecklistSection(analysis) {
    let content = '## Checklist\n\n';
    
    // Standard checklist items
    content += '- [ ] Code follows project standards\n';
    content += '- [ ] Self-review completed\n';
    content += '- [ ] Documentation updated\n';
    content += '- [ ] No breaking changes (or breaking changes documented)\n';
    
    // Add complexity-specific items
    if (analysis.complexity.level !== 'simple') {
      content += '- [ ] Code is well-commented\n';
      content += '- [ ] Error handling is comprehensive\n';
    }
    
    // Add risk-specific items
    if (analysis.riskFactors.length > 0) {
      content += '- [ ] Risk factors have been addressed\n';
      content += '- [ ] Rollback plan is in place\n';
    }
    
    // Add technology-specific items
    if (analysis.technologies.databases.length > 0) {
      content += '- [ ] Database changes are backward compatible\n';
    }
    
    if (analysis.technologies.technical.includes('authentication')) {
      content += '- [ ] Security implications reviewed\n';
    }
    
    return content;
  }

  /**
   * Generate metadata section
   * @param {Object} codegenResult - Codegen result
   * @param {Object} analysis - Task analysis
   * @returns {string} Metadata section
   * @private
   */
  _generateMetadataSection(codegenResult, analysis) {
    let content = '---\n\n';
    content += '## Metadata\n\n';
    content += '<details>\n';
    content += '<summary>Codegen Information</summary>\n\n';
    
    content += `- **Codegen Task ID**: \`${codegenResult.taskId}\`\n`;
    content += `- **Analysis Timestamp**: \`${analysis.timestamp}\`\n`;
    content += `- **Intent**: ${analysis.intent.primary}\n`;
    content += `- **Complexity**: ${analysis.complexity.level}\n`;
    content += `- **Estimated Effort**: ${analysis.estimatedEffort.estimatedHours} hours\n`;
    
    if (analysis.priority) {
      content += `- **Priority**: ${analysis.priority.level}\n`;
    }
    
    if (codegenResult.metadata) {
      content += `- **Response Time**: ${codegenResult.metadata.responseTime}ms\n`;
      
      if (codegenResult.metadata.tokensUsed) {
        content += `- **Tokens Used**: ${codegenResult.metadata.tokensUsed}\n`;
      }
    }
    
    content += '\n</details>\n';
    
    return content;
  }

  /**
   * Determine PR type based on analysis
   * @param {Object} analysis - Task analysis
   * @returns {string} PR type
   * @private
   */
  _determinePRType(analysis) {
    const intent = analysis.intent.primary;
    const description = analysis.originalDescription.toLowerCase();
    
    if (intent === 'fix' || /bug|fix|issue/i.test(description)) {
      return 'bugfix';
    }
    
    if (intent === 'refactor' || /refactor|optimize|improve/i.test(description)) {
      return 'refactor';
    }
    
    if (/doc|readme|comment/i.test(description)) {
      return 'docs';
    }
    
    if (/test|spec|lint|format/i.test(description)) {
      return 'chore';
    }
    
    return 'feature';
  }

  /**
   * Extract title description from full description
   * @param {string} description - Full description
   * @returns {string} Title description
   * @private
   */
  _extractTitleDescription(description) {
    // Take first sentence or first 50 characters
    const firstSentence = description.split('.')[0];
    if (firstSentence.length <= 50) {
      return firstSentence;
    }
    
    return description.substring(0, 47) + '...';
  }

  /**
   * Generate branch name
   * @param {Object} analysis - Task analysis
   * @param {Object} context - Additional context
   * @returns {string} Branch name
   * @private
   */
  _generateBranchName(analysis, context) {
    if (context.branchName) {
      return context.branchName;
    }
    
    const prefix = this.config.branchPrefix;
    const intent = analysis.intent.primary;
    const description = analysis.originalDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
    
    const timestamp = Date.now().toString().slice(-6);
    
    return `${prefix}${intent}-${description}-${timestamp}`;
  }

  /**
   * Generate labels
   * @param {Object} analysis - Task analysis
   * @param {Object} template - PR template
   * @returns {Array} Labels
   * @private
   */
  _generateLabels(analysis, template) {
    const labels = [...template.labels];
    
    // Add complexity label
    if (analysis.complexity.level !== 'simple') {
      labels.push(`complexity:${analysis.complexity.level}`);
    }
    
    // Add technology labels
    analysis.technologies.languages.forEach(lang => {
      labels.push(lang);
    });
    
    // Add priority label
    if (analysis.priority && analysis.priority.level !== 'medium') {
      labels.push(`priority:${analysis.priority.level}`);
    }
    
    return labels;
  }

  /**
   * Generate assignees
   * @param {Object} context - Additional context
   * @returns {Array} Assignees
   * @private
   */
  _generateAssignees(context) {
    if (context.assignees) {
      return Array.isArray(context.assignees) ? context.assignees : [context.assignees];
    }
    
    return [];
  }

  /**
   * Generate reviewers
   * @param {Object} context - Additional context
   * @returns {Array} Reviewers
   * @private
   */
  _generateReviewers(context) {
    if (context.reviewers) {
      return Array.isArray(context.reviewers) ? context.reviewers : [context.reviewers];
    }
    
    if (this.config.autoAssignReviewers && this.config.defaultReviewers.length > 0) {
      return [...this.config.defaultReviewers];
    }
    
    return [];
  }

  /**
   * Update PR with additional information
   * @param {Object} prData - Existing PR data
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated PR data
   */
  updatePR(prData, updates) {
    const updatedPR = { ...prData };
    
    if (updates.title) {
      updatedPR.title = updates.title;
    }
    
    if (updates.body) {
      updatedPR.body = updates.body;
    }
    
    if (updates.labels) {
      updatedPR.labels = [...new Set([...updatedPR.labels, ...updates.labels])];
    }
    
    if (updates.reviewers) {
      updatedPR.reviewers = [...new Set([...updatedPR.reviewers, ...updates.reviewers])];
    }
    
    // Update metadata
    updatedPR.metadata.updatedAt = new Date().toISOString();
    
    return updatedPR;
  }

  /**
   * Generate PR statistics
   * @param {Object} prData - PR data
   * @returns {Object} PR statistics
   */
  generateStatistics(prData) {
    return {
      title: prData.title,
      type: prData.metadata.prType,
      complexity: prData.metadata.template,
      labelCount: prData.labels.length,
      reviewerCount: prData.reviewers.length,
      isDraft: prData.draft || false,
      bodyLength: prData.body.length,
      createdAt: prData.metadata.createdAt
    };
  }
}

export default PRCreator;

