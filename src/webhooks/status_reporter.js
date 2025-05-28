/**
 * @fileoverview Status Reporter
 * @description Reports validation status and results back to GitHub
 */

import { Octokit } from '@octokit/rest';
import { log } from '../../scripts/modules/utils.js';
import { CodegenErrorHandler } from '../ai_cicd_system/core/error_handler.js';

/**
 * Status Reporter
 * Handles reporting validation status and results back to GitHub
 */
export class StatusReporter {
  constructor(config = {}) {
    this.config = {
      githubToken: config.githubToken,
      apiUrl: config.apiUrl || 'https://api.github.com',
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
   * Report status to GitHub
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} status - Status object
   * @returns {Promise<void>}
   */
  async reportStatus(pullRequest, status) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);
      const sha = pullRequest.head.sha;

      await this.errorHandler.handleError(
        async () => {
          await this.octokit.repos.createCommitStatus({
            owner,
            repo,
            sha,
            state: status.state,
            description: status.description,
            context: status.context || 'codegen/pr-validation',
            target_url: status.target_url
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'report_status',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Status reported to GitHub', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        state: status.state,
        context: status.context,
        description: status.description
      });

    } catch (error) {
      log('error', 'Failed to report status to GitHub', {
        pr_number: pullRequest.number,
        error: error.message,
        status: status
      });
      throw error;
    }
  }

  /**
   * Post comment on PR
   * @param {Object} pullRequest - GitHub PR object
   * @param {string} body - Comment body
   * @returns {Promise<Object>} Comment object
   */
  async postComment(pullRequest, body) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      const response = await this.errorHandler.handleError(
        async () => {
          return await this.octokit.issues.createComment({
            owner,
            repo,
            issue_number: pullRequest.number,
            body
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'post_comment',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Comment posted to PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        comment_id: response.data.id
      });

      return response.data;

    } catch (error) {
      log('error', 'Failed to post comment to PR', {
        pr_number: pullRequest.number,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Post review comment on specific line
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} comment - Review comment object
   * @returns {Promise<Object>} Review comment object
   */
  async postReviewComment(pullRequest, comment) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      const response = await this.errorHandler.handleError(
        async () => {
          return await this.octokit.pulls.createReviewComment({
            owner,
            repo,
            pull_number: pullRequest.number,
            body: comment.body,
            path: comment.path,
            line: comment.line,
            side: comment.side || 'RIGHT'
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'post_review_comment',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Review comment posted to PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        file: comment.path,
        line: comment.line,
        comment_id: response.data.id
      });

      return response.data;

    } catch (error) {
      log('error', 'Failed to post review comment to PR', {
        pr_number: pullRequest.number,
        error: error.message,
        comment: comment
      });
      throw error;
    }
  }

  /**
   * Submit PR review
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} review - Review object
   * @returns {Promise<Object>} Review object
   */
  async submitReview(pullRequest, review) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      const response = await this.errorHandler.handleError(
        async () => {
          return await this.octokit.pulls.createReview({
            owner,
            repo,
            pull_number: pullRequest.number,
            body: review.body,
            event: review.event || 'COMMENT',
            comments: review.comments || []
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'submit_review',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Review submitted to PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        event: review.event,
        review_id: response.data.id
      });

      return response.data;

    } catch (error) {
      log('error', 'Failed to submit review to PR', {
        pr_number: pullRequest.number,
        error: error.message,
        review: review
      });
      throw error;
    }
  }

  /**
   * Update PR labels
   * @param {Object} pullRequest - GitHub PR object
   * @param {Array} labels - Array of label names
   * @returns {Promise<void>}
   */
  async updateLabels(pullRequest, labels) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      await this.errorHandler.handleError(
        async () => {
          await this.octokit.issues.setLabels({
            owner,
            repo,
            issue_number: pullRequest.number,
            labels
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'update_labels',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Labels updated on PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        labels: labels
      });

    } catch (error) {
      log('error', 'Failed to update labels on PR', {
        pr_number: pullRequest.number,
        error: error.message,
        labels: labels
      });
      throw error;
    }
  }

  /**
   * Add label to PR
   * @param {Object} pullRequest - GitHub PR object
   * @param {string} label - Label name
   * @returns {Promise<void>}
   */
  async addLabel(pullRequest, label) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      await this.errorHandler.handleError(
        async () => {
          await this.octokit.issues.addLabels({
            owner,
            repo,
            issue_number: pullRequest.number,
            labels: [label]
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'add_label',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Label added to PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        label: label
      });

    } catch (error) {
      log('error', 'Failed to add label to PR', {
        pr_number: pullRequest.number,
        error: error.message,
        label: label
      });
      throw error;
    }
  }

  /**
   * Remove label from PR
   * @param {Object} pullRequest - GitHub PR object
   * @param {string} label - Label name
   * @returns {Promise<void>}
   */
  async removeLabel(pullRequest, label) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      await this.errorHandler.handleError(
        async () => {
          await this.octokit.issues.removeLabel({
            owner,
            repo,
            issue_number: pullRequest.number,
            name: label
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'remove_label',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Label removed from PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        label: label
      });

    } catch (error) {
      log('error', 'Failed to remove label from PR', {
        pr_number: pullRequest.number,
        error: error.message,
        label: label
      });
      // Don't throw error for label removal failures
    }
  }

  /**
   * Request reviewers for PR
   * @param {Object} pullRequest - GitHub PR object
   * @param {Array} reviewers - Array of reviewer usernames
   * @param {Array} teamReviewers - Array of team names
   * @returns {Promise<void>}
   */
  async requestReviewers(pullRequest, reviewers = [], teamReviewers = []) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      await this.errorHandler.handleError(
        async () => {
          await this.octokit.pulls.requestReviewers({
            owner,
            repo,
            pull_number: pullRequest.number,
            reviewers,
            team_reviewers: teamReviewers
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'request_reviewers',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Reviewers requested for PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        reviewers: reviewers,
        team_reviewers: teamReviewers
      });

    } catch (error) {
      log('error', 'Failed to request reviewers for PR', {
        pr_number: pullRequest.number,
        error: error.message,
        reviewers: reviewers,
        team_reviewers: teamReviewers
      });
      throw error;
    }
  }

  /**
   * Create check run
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} checkRun - Check run object
   * @returns {Promise<Object>} Check run object
   */
  async createCheckRun(pullRequest, checkRun) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      const response = await this.errorHandler.handleError(
        async () => {
          return await this.octokit.checks.create({
            owner,
            repo,
            name: checkRun.name,
            head_sha: pullRequest.head.sha,
            status: checkRun.status || 'in_progress',
            conclusion: checkRun.conclusion,
            started_at: checkRun.started_at || new Date().toISOString(),
            completed_at: checkRun.completed_at,
            output: checkRun.output,
            actions: checkRun.actions
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'create_check_run',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Check run created for PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        check_name: checkRun.name,
        check_id: response.data.id
      });

      return response.data;

    } catch (error) {
      log('error', 'Failed to create check run for PR', {
        pr_number: pullRequest.number,
        error: error.message,
        check_run: checkRun
      });
      throw error;
    }
  }

  /**
   * Update check run
   * @param {Object} pullRequest - GitHub PR object
   * @param {number} checkRunId - Check run ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated check run object
   */
  async updateCheckRun(pullRequest, checkRunId, updates) {
    try {
      const { owner, repo } = this.extractRepoInfo(pullRequest);

      const response = await this.errorHandler.handleError(
        async () => {
          return await this.octokit.checks.update({
            owner,
            repo,
            check_run_id: checkRunId,
            ...updates
          });
        },
        { 
          component: 'status_reporter', 
          operation: 'update_check_run',
          pr_number: pullRequest.number
        }
      );

      log('info', 'Check run updated for PR', {
        pr_number: pullRequest.number,
        repository: `${owner}/${repo}`,
        check_id: checkRunId,
        status: updates.status,
        conclusion: updates.conclusion
      });

      return response.data;

    } catch (error) {
      log('error', 'Failed to update check run for PR', {
        pr_number: pullRequest.number,
        error: error.message,
        check_run_id: checkRunId,
        updates: updates
      });
      throw error;
    }
  }

  /**
   * Report validation summary
   * @param {Object} pullRequest - GitHub PR object
   * @param {Object} summary - Validation summary
   * @returns {Promise<void>}
   */
  async reportValidationSummary(pullRequest, summary) {
    try {
      // Create status
      await this.reportStatus(pullRequest, {
        state: summary.passed ? 'success' : 'failure',
        description: this.generateStatusDescription(summary),
        context: 'codegen/pr-validation',
        target_url: summary.report_url
      });

      // Add appropriate labels
      const labels = this.generateLabels(summary);
      if (labels.length > 0) {
        await this.updateLabels(pullRequest, labels);
      }

      // Post summary comment if there are issues
      if (summary.issues_count > 0) {
        const comment = this.generateSummaryComment(summary);
        await this.postComment(pullRequest, comment);
      }

      log('info', 'Validation summary reported', {
        pr_number: pullRequest.number,
        passed: summary.passed,
        issues_count: summary.issues_count,
        critical_issues: summary.critical_issues
      });

    } catch (error) {
      log('error', 'Failed to report validation summary', {
        pr_number: pullRequest.number,
        error: error.message,
        summary: summary
      });
      throw error;
    }
  }

  /**
   * Extract repository info from PR object
   * @param {Object} pullRequest - GitHub PR object
   * @returns {Object} Repository info
   * @private
   */
  extractRepoInfo(pullRequest) {
    const repo = pullRequest.base?.repo || pullRequest.repository;
    return {
      owner: repo.owner.login,
      repo: repo.name
    };
  }

  /**
   * Generate status description
   * @param {Object} summary - Validation summary
   * @returns {string} Status description
   * @private
   */
  generateStatusDescription(summary) {
    if (summary.passed) {
      if (summary.issues_count === 0) {
        return 'All validations passed';
      } else {
        return `Passed with ${summary.issues_count} minor issues`;
      }
    } else {
      return `Failed: ${summary.critical_issues} critical, ${summary.high_issues} high issues`;
    }
  }

  /**
   * Generate labels based on validation summary
   * @param {Object} summary - Validation summary
   * @returns {Array} Array of label names
   * @private
   */
  generateLabels(summary) {
    const labels = [];

    if (summary.critical_issues > 0) {
      labels.push('validation:critical-issues');
    } else if (summary.high_issues > 0) {
      labels.push('validation:high-issues');
    } else if (summary.issues_count > 0) {
      labels.push('validation:minor-issues');
    } else {
      labels.push('validation:passed');
    }

    if (summary.complexity_score > 8) {
      labels.push('complexity:high');
    }

    if (summary.risk_score > 7) {
      labels.push('risk:high');
    }

    return labels;
  }

  /**
   * Generate summary comment
   * @param {Object} summary - Validation summary
   * @returns {string} Comment text
   * @private
   */
  generateSummaryComment(summary) {
    const emoji = summary.passed ? '✅' : '❌';
    const status = summary.passed ? 'Passed' : 'Failed';
    
    return `## ${emoji} PR Validation ${status}

### Summary
- **Files analyzed**: ${summary.files_analyzed}
- **Total changes**: ${summary.total_changes}
- **Issues found**: ${summary.issues_count}
- **Complexity score**: ${summary.complexity_score}/10
- **Risk score**: ${summary.risk_score}/10

### Issues Breakdown
- 🔴 **Critical**: ${summary.critical_issues}
- 🟠 **High**: ${summary.high_issues}
- 🟡 **Medium**: ${summary.medium_issues}
- 🟢 **Low**: ${summary.low_issues}

${summary.recommendations?.length > 0 ? `### Recommendations
${summary.recommendations.map(r => `- ${r.message}`).join('\n')}` : ''}

${summary.report_url ? `[View detailed report](${summary.report_url})` : ''}`;
  }
}

export default StatusReporter;

