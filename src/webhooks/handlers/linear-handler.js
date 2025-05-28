/**
 * Linear Handler
 * 
 * Handler for updating Linear issue status based on PR events
 * and maintaining synchronization between GitHub and Linear.
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';

export class LinearHandler {
  constructor(config = {}) {
    this.config = {
      apiUrl: config.apiUrl || process.env.LINEAR_API_URL || 'https://api.linear.app',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 2,
      apiToken: config.apiToken || process.env.LINEAR_API_TOKEN,
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-task-master-webhook/1.0.0',
        ...(this.config.apiToken && { 'Authorization': this.config.apiToken })
      }
    });

    this.stats = {
      issuesUpdated: 0,
      issuesCreated: 0,
      commentsAdded: 0,
      statusChanges: 0,
      syncOperations: 0
    };

    // Status mapping between GitHub PR states and Linear states
    this.statusMapping = {
      'pr_opened': 'In Progress',
      'pr_updated': 'In Progress',
      'pr_closed_merged': 'Done',
      'pr_closed_unmerged': 'Cancelled',
      'pr_reopened': 'In Progress',
      'workflow_success': 'In Review',
      'workflow_failure': 'Blocked'
    };
  }

  /**
   * Update Linear issue status when PR is created
   */
  async updateIssueStatus(event) {
    try {
      logger.info('Updating Linear issue status for PR creation', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number,
        prTitle: event.pullRequest.title
      });

      // Extract Linear issue ID from PR title or body
      const issueId = this.extractLinearIssueId(event.pullRequest);
      
      if (!issueId) {
        logger.info('No Linear issue ID found in PR', {
          eventId: event.id,
          prNumber: event.pullRequest.number
        });
        return { success: true, message: 'No Linear issue ID found' };
      }

      // Update issue status
      const updateResult = await this.updateIssueStatusById(issueId, 'In Progress', {
        eventId: event.id,
        prNumber: event.pullRequest.number,
        prUrl: event.pullRequest.url,
        action: 'pr_opened'
      });

      // Add comment to issue
      await this.addCommentToIssue(issueId, 
        `🔗 **PR Created**: [#${event.pullRequest.number} ${event.pullRequest.title}](${event.pullRequest.url})\n\n` +
        `Branch: \`${event.pullRequest.head.ref}\`\n` +
        `Status: Open and ready for review`
      );

      this.stats.issuesUpdated++;
      this.stats.commentsAdded++;
      this.stats.statusChanges++;

      logger.info('Linear issue updated successfully for PR creation', {
        eventId: event.id,
        issueId,
        status: 'In Progress'
      });

      return {
        success: true,
        issueId,
        status: 'In Progress',
        message: 'Linear issue updated for PR creation'
      };

    } catch (error) {
      logger.error('Failed to update Linear issue for PR creation', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear issue update failed: ${error.message}`);
    }
  }

  /**
   * Update Linear issue progress when PR is updated
   */
  async updateIssueProgress(event) {
    try {
      logger.info('Updating Linear issue progress for PR update', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number
      });

      const issueId = this.extractLinearIssueId(event.pullRequest);
      
      if (!issueId) {
        return { success: true, message: 'No Linear issue ID found' };
      }

      // Add progress comment
      await this.addCommentToIssue(issueId,
        `🔄 **PR Updated**: [#${event.pullRequest.number}](${event.pullRequest.url})\n\n` +
        `New commit: \`${event.pullRequest.head.sha.substring(0, 7)}\`\n` +
        `Branch: \`${event.pullRequest.head.ref}\``
      );

      this.stats.commentsAdded++;

      logger.info('Linear issue progress updated successfully', {
        eventId: event.id,
        issueId
      });

      return {
        success: true,
        issueId,
        message: 'Linear issue progress updated'
      };

    } catch (error) {
      logger.error('Failed to update Linear issue progress', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear issue progress update failed: ${error.message}`);
    }
  }

  /**
   * Update Linear issue completion when PR is closed
   */
  async updateIssueCompletion(event) {
    try {
      logger.info('Updating Linear issue completion for PR closure', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number,
        merged: event.pullRequest.merged
      });

      const issueId = this.extractLinearIssueId(event.pullRequest);
      
      if (!issueId) {
        return { success: true, message: 'No Linear issue ID found' };
      }

      const newStatus = event.pullRequest.merged ? 'Done' : 'Cancelled';
      const statusEmoji = event.pullRequest.merged ? '✅' : '❌';
      const statusText = event.pullRequest.merged ? 'merged' : 'closed without merging';

      // Update issue status
      await this.updateIssueStatusById(issueId, newStatus, {
        eventId: event.id,
        prNumber: event.pullRequest.number,
        merged: event.pullRequest.merged,
        action: 'pr_closed'
      });

      // Add completion comment
      await this.addCommentToIssue(issueId,
        `${statusEmoji} **PR ${statusText}**: [#${event.pullRequest.number}](${event.pullRequest.url})\n\n` +
        `Final status: ${newStatus}\n` +
        (event.pullRequest.merged ? 
          `Merged into \`${event.pullRequest.base.ref}\`` : 
          'Closed without merging')
      );

      this.stats.issuesUpdated++;
      this.stats.commentsAdded++;
      this.stats.statusChanges++;

      logger.info('Linear issue completion updated successfully', {
        eventId: event.id,
        issueId,
        status: newStatus
      });

      return {
        success: true,
        issueId,
        status: newStatus,
        message: 'Linear issue completion updated'
      };

    } catch (error) {
      logger.error('Failed to update Linear issue completion', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear issue completion update failed: ${error.message}`);
    }
  }

  /**
   * Update Linear issue when PR is reopened
   */
  async updateIssueReopened(event) {
    try {
      logger.info('Updating Linear issue for PR reopening', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number
      });

      const issueId = this.extractLinearIssueId(event.pullRequest);
      
      if (!issueId) {
        return { success: true, message: 'No Linear issue ID found' };
      }

      // Update issue status back to In Progress
      await this.updateIssueStatusById(issueId, 'In Progress', {
        eventId: event.id,
        prNumber: event.pullRequest.number,
        action: 'pr_reopened'
      });

      // Add reopening comment
      await this.addCommentToIssue(issueId,
        `🔄 **PR Reopened**: [#${event.pullRequest.number}](${event.pullRequest.url})\n\n` +
        `Status: Back in progress\n` +
        `Branch: \`${event.pullRequest.head.ref}\``
      );

      this.stats.issuesUpdated++;
      this.stats.commentsAdded++;
      this.stats.statusChanges++;

      logger.info('Linear issue updated successfully for PR reopening', {
        eventId: event.id,
        issueId
      });

      return {
        success: true,
        issueId,
        status: 'In Progress',
        message: 'Linear issue updated for PR reopening'
      };

    } catch (error) {
      logger.error('Failed to update Linear issue for PR reopening', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear issue reopening update failed: ${error.message}`);
    }
  }

  /**
   * Update branch status in Linear
   */
  async updateBranchStatus(event) {
    try {
      logger.info('Updating Linear branch status for push event', {
        eventId: event.id,
        repository: event.repository.fullName,
        ref: event.push.ref,
        commits: event.push.commits.length
      });

      // Extract branch name
      const branchName = event.push.ref.replace('refs/heads/', '');
      
      // Look for Linear issue ID in branch name or commit messages
      const issueId = this.extractLinearIssueIdFromBranch(branchName) ||
                     this.extractLinearIssueIdFromCommits(event.push.commits);

      if (!issueId) {
        return { success: true, message: 'No Linear issue ID found' };
      }

      // Add push activity comment
      const commitSummary = event.push.commits.slice(0, 3).map(commit => 
        `• ${commit.message.split('\n')[0]} (\`${commit.id.substring(0, 7)}\`)`
      ).join('\n');

      const moreCommits = event.push.commits.length > 3 ? 
        `\n... and ${event.push.commits.length - 3} more commits` : '';

      await this.addCommentToIssue(issueId,
        `📝 **New commits pushed** to \`${branchName}\`:\n\n` +
        commitSummary + moreCommits
      );

      this.stats.commentsAdded++;

      logger.info('Linear branch status updated successfully', {
        eventId: event.id,
        issueId,
        branchName,
        commits: event.push.commits.length
      });

      return {
        success: true,
        issueId,
        branchName,
        message: 'Linear branch status updated'
      };

    } catch (error) {
      logger.error('Failed to update Linear branch status', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear branch status update failed: ${error.message}`);
    }
  }

  /**
   * Update workflow status in Linear
   */
  async updateWorkflowStatus(event) {
    try {
      logger.info('Updating Linear workflow status', {
        eventId: event.id,
        workflowId: event.workflowRun.id,
        conclusion: event.workflowRun.conclusion
      });

      // Find related PR and extract issue ID
      const relatedPR = event.workflowRun.pullRequests?.[0];
      let issueId = null;

      if (relatedPR) {
        issueId = this.extractLinearIssueIdFromPRNumber(relatedPR.number, event.repository.fullName);
      }

      if (!issueId) {
        // Try to extract from branch name
        issueId = this.extractLinearIssueIdFromBranch(event.workflowRun.headBranch);
      }

      if (!issueId) {
        return { success: true, message: 'No Linear issue ID found' };
      }

      const statusEmoji = event.workflowRun.conclusion === 'success' ? '✅' : 
                         event.workflowRun.conclusion === 'failure' ? '❌' : '⚠️';

      // Add workflow status comment
      await this.addCommentToIssue(issueId,
        `${statusEmoji} **Workflow ${event.workflowRun.conclusion}**: [${event.workflowRun.name}](${event.workflowRun.url})\n\n` +
        `Run #${event.workflowRun.runNumber}\n` +
        `Branch: \`${event.workflowRun.headBranch}\`\n` +
        `Commit: \`${event.workflowRun.headSha.substring(0, 7)}\``
      );

      this.stats.commentsAdded++;

      logger.info('Linear workflow status updated successfully', {
        eventId: event.id,
        issueId,
        conclusion: event.workflowRun.conclusion
      });

      return {
        success: true,
        issueId,
        conclusion: event.workflowRun.conclusion,
        message: 'Linear workflow status updated'
      };

    } catch (error) {
      logger.error('Failed to update Linear workflow status', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear workflow status update failed: ${error.message}`);
    }
  }

  /**
   * Update failure status in Linear
   */
  async updateFailureStatus(event) {
    try {
      logger.info('Updating Linear failure status', {
        eventId: event.id,
        workflowId: event.workflowRun.id
      });

      const relatedPR = event.workflowRun.pullRequests?.[0];
      let issueId = null;

      if (relatedPR) {
        issueId = this.extractLinearIssueIdFromPRNumber(relatedPR.number, event.repository.fullName);
      }

      if (!issueId) {
        issueId = this.extractLinearIssueIdFromBranch(event.workflowRun.headBranch);
      }

      if (!issueId) {
        return { success: true, message: 'No Linear issue ID found' };
      }

      // Update issue status to Blocked
      await this.updateIssueStatusById(issueId, 'Blocked', {
        eventId: event.id,
        workflowId: event.workflowRun.id,
        action: 'workflow_failed'
      });

      // Add failure comment
      await this.addCommentToIssue(issueId,
        `🚨 **Workflow Failed**: [${event.workflowRun.name}](${event.workflowRun.url})\n\n` +
        `Run #${event.workflowRun.runNumber} failed\n` +
        `Branch: \`${event.workflowRun.headBranch}\`\n` +
        `Commit: \`${event.workflowRun.headSha.substring(0, 7)}\`\n\n` +
        `Status updated to **Blocked** - requires investigation`
      );

      this.stats.issuesUpdated++;
      this.stats.commentsAdded++;
      this.stats.statusChanges++;

      logger.info('Linear failure status updated successfully', {
        eventId: event.id,
        issueId
      });

      return {
        success: true,
        issueId,
        status: 'Blocked',
        message: 'Linear failure status updated'
      };

    } catch (error) {
      logger.error('Failed to update Linear failure status', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear failure status update failed: ${error.message}`);
    }
  }

  /**
   * Sync GitHub issue to Linear
   */
  async syncIssueCreated(event) {
    try {
      logger.info('Syncing GitHub issue to Linear', {
        eventId: event.id,
        issueNumber: event.issue.number,
        title: event.issue.title
      });

      // Create Linear issue
      const linearIssue = await this.createLinearIssue({
        title: `[GitHub] ${event.issue.title}`,
        description: `${event.issue.body}\n\n---\n**Source**: [GitHub Issue #${event.issue.number}](${event.issue.url})`,
        labels: event.issue.labels.map(label => label.name),
        priority: this.mapGitHubPriorityToLinear(event.issue.labels),
        teamId: this.config.defaultTeamId
      });

      this.stats.issuesCreated++;
      this.stats.syncOperations++;

      logger.info('GitHub issue synced to Linear successfully', {
        eventId: event.id,
        githubIssue: event.issue.number,
        linearIssue: linearIssue.id
      });

      return {
        success: true,
        linearIssueId: linearIssue.id,
        message: 'GitHub issue synced to Linear'
      };

    } catch (error) {
      logger.error('Failed to sync GitHub issue to Linear', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`GitHub issue sync failed: ${error.message}`);
    }
  }

  /**
   * Sync GitHub issue closure to Linear
   */
  async syncIssueClosed(event) {
    try {
      logger.info('Syncing GitHub issue closure to Linear', {
        eventId: event.id,
        issueNumber: event.issue.number
      });

      // Find corresponding Linear issue
      const linearIssueId = await this.findLinearIssueByGitHubIssue(event.issue.number);
      
      if (!linearIssueId) {
        return { success: true, message: 'No corresponding Linear issue found' };
      }

      // Update Linear issue status
      await this.updateIssueStatusById(linearIssueId, 'Done', {
        eventId: event.id,
        githubIssue: event.issue.number,
        action: 'github_issue_closed'
      });

      // Add closure comment
      await this.addCommentToIssue(linearIssueId,
        `✅ **GitHub issue closed**: [#${event.issue.number}](${event.issue.url})\n\n` +
        `Automatically marked as Done`
      );

      this.stats.issuesUpdated++;
      this.stats.commentsAdded++;
      this.stats.syncOperations++;

      logger.info('GitHub issue closure synced to Linear successfully', {
        eventId: event.id,
        linearIssueId
      });

      return {
        success: true,
        linearIssueId,
        message: 'GitHub issue closure synced to Linear'
      };

    } catch (error) {
      logger.error('Failed to sync GitHub issue closure to Linear', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`GitHub issue closure sync failed: ${error.message}`);
    }
  }

  /**
   * Sync GitHub comment to Linear
   */
  async syncComment(event) {
    try {
      logger.info('Syncing GitHub comment to Linear', {
        eventId: event.id,
        issueNumber: event.issue.number,
        commentId: event.payload.comment.id
      });

      const linearIssueId = this.extractLinearIssueId(event.issue) ||
                           await this.findLinearIssueByGitHubIssue(event.issue.number);

      if (!linearIssueId) {
        return { success: true, message: 'No corresponding Linear issue found' };
      }

      // Add comment to Linear issue
      await this.addCommentToIssue(linearIssueId,
        `💬 **GitHub comment** by ${event.payload.comment.user.login}:\n\n` +
        `${event.payload.comment.body}\n\n` +
        `---\n[View on GitHub](${event.payload.comment.html_url})`
      );

      this.stats.commentsAdded++;
      this.stats.syncOperations++;

      logger.info('GitHub comment synced to Linear successfully', {
        eventId: event.id,
        linearIssueId
      });

      return {
        success: true,
        linearIssueId,
        message: 'GitHub comment synced to Linear'
      };

    } catch (error) {
      logger.error('Failed to sync GitHub comment to Linear', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`GitHub comment sync failed: ${error.message}`);
    }
  }

  /**
   * Update review status in Linear
   */
  async updateReviewStatus(event) {
    try {
      logger.info('Updating Linear review status', {
        eventId: event.id,
        prNumber: event.payload.pull_request.number,
        reviewState: event.payload.review.state
      });

      const issueId = this.extractLinearIssueIdFromPRNumber(
        event.payload.pull_request.number, 
        event.repository.fullName
      );

      if (!issueId) {
        return { success: true, message: 'No Linear issue ID found' };
      }

      const reviewEmoji = {
        'approved': '✅',
        'changes_requested': '🔄',
        'commented': '💬'
      }[event.payload.review.state] || '📝';

      // Add review comment
      await this.addCommentToIssue(issueId,
        `${reviewEmoji} **PR Review ${event.payload.review.state}** by ${event.payload.review.user.login}\n\n` +
        (event.payload.review.body ? `${event.payload.review.body}\n\n` : '') +
        `[View review](${event.payload.review.html_url})`
      );

      this.stats.commentsAdded++;

      logger.info('Linear review status updated successfully', {
        eventId: event.id,
        issueId,
        reviewState: event.payload.review.state
      });

      return {
        success: true,
        issueId,
        reviewState: event.payload.review.state,
        message: 'Linear review status updated'
      };

    } catch (error) {
      logger.error('Failed to update Linear review status', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Linear review status update failed: ${error.message}`);
    }
  }

  // Helper methods

  /**
   * Extract Linear issue ID from PR title or body
   */
  extractLinearIssueId(pullRequest) {
    if (!pullRequest) return null;

    const text = `${pullRequest.title} ${pullRequest.body || ''}`;
    
    // Look for patterns like: ZAM-123, LINEAR-456, etc.
    const patterns = [
      /([A-Z]{2,}-\d+)/g,
      /linear\.app\/[^\/]+\/issue\/([A-Z]{2,}-\d+)/g,
      /\[([A-Z]{2,}-\d+)\]/g
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }

  /**
   * Extract Linear issue ID from branch name
   */
  extractLinearIssueIdFromBranch(branchName) {
    if (!branchName) return null;

    const patterns = [
      /([A-Z]{2,}-\d+)/,
      /feature\/([A-Z]{2,}-\d+)/,
      /fix\/([A-Z]{2,}-\d+)/
    ];

    for (const pattern of patterns) {
      const match = branchName.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extract Linear issue ID from commit messages
   */
  extractLinearIssueIdFromCommits(commits) {
    for (const commit of commits) {
      const issueId = this.extractLinearIssueId({ title: commit.message, body: '' });
      if (issueId) return issueId;
    }
    return null;
  }

  /**
   * Extract Linear issue ID from PR number (placeholder - would need actual implementation)
   */
  extractLinearIssueIdFromPRNumber(prNumber, repository) {
    // This would require a database lookup or API call to find the mapping
    // For now, return null - implement based on your storage mechanism
    return null;
  }

  /**
   * Update Linear issue status by ID
   */
  async updateIssueStatusById(issueId, status, metadata = {}) {
    const mutation = `
      mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            title
            state {
              name
            }
          }
        }
      }
    `;

    const variables = {
      id: issueId,
      input: {
        stateId: await this.getStateIdByName(status)
      }
    };

    const response = await this.client.post('/graphql', {
      query: mutation,
      variables
    });

    return response.data.data.issueUpdate;
  }

  /**
   * Add comment to Linear issue
   */
  async addCommentToIssue(issueId, body) {
    const mutation = `
      mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
            body
          }
        }
      }
    `;

    const variables = {
      input: {
        issueId,
        body
      }
    };

    const response = await this.client.post('/graphql', {
      query: mutation,
      variables
    });

    return response.data.data.commentCreate;
  }

  /**
   * Create Linear issue
   */
  async createLinearIssue(issueData) {
    const mutation = `
      mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
          }
        }
      }
    `;

    const variables = {
      input: issueData
    };

    const response = await this.client.post('/graphql', {
      query: mutation,
      variables
    });

    return response.data.data.issueCreate.issue;
  }

  /**
   * Get state ID by name (placeholder - implement based on your Linear setup)
   */
  async getStateIdByName(stateName) {
    // This would require a query to get available states and find the ID
    // For now, return a placeholder - implement based on your Linear team setup
    const stateMap = {
      'Backlog': 'backlog-state-id',
      'In Progress': 'in-progress-state-id',
      'In Review': 'in-review-state-id',
      'Done': 'done-state-id',
      'Cancelled': 'cancelled-state-id',
      'Blocked': 'blocked-state-id'
    };

    return stateMap[stateName] || stateMap['In Progress'];
  }

  /**
   * Find Linear issue by GitHub issue number (placeholder)
   */
  async findLinearIssueByGitHubIssue(githubIssueNumber) {
    // This would require a search query or database lookup
    // For now, return null - implement based on your storage mechanism
    return null;
  }

  /**
   * Map GitHub priority labels to Linear priority
   */
  mapGitHubPriorityToLinear(labels) {
    const priorityLabels = labels.filter(label => 
      label.name.toLowerCase().includes('priority') ||
      label.name.toLowerCase().includes('urgent') ||
      label.name.toLowerCase().includes('critical')
    );

    if (priorityLabels.some(label => label.name.toLowerCase().includes('critical'))) {
      return 1; // Urgent
    }
    if (priorityLabels.some(label => label.name.toLowerCase().includes('high'))) {
      return 2; // High
    }
    if (priorityLabels.some(label => label.name.toLowerCase().includes('low'))) {
      return 4; // Low
    }
    
    return 3; // Medium (default)
  }

  /**
   * Health check for Linear service
   */
  async healthCheck() {
    try {
      const query = `
        query {
          viewer {
            id
            name
          }
        }
      `;

      const response = await this.client.post('/graphql', { query });
      
      return {
        healthy: true,
        user: response.data.data.viewer
      };

    } catch (error) {
      logger.warn('Linear health check failed', {
        error: error.message
      });

      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return this.stats;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      issuesUpdated: 0,
      issuesCreated: 0,
      commentsAdded: 0,
      statusChanges: 0,
      syncOperations: 0
    };
  }
}

export default LinearHandler;

