/**
 * Linear API Client with Authentication and Rate Limiting
 * 
 * Provides a robust interface to the Linear API with built-in rate limiting,
 * authentication management, and error handling for the AI CI/CD system.
 */

import { RateLimiter } from '../core/rate_limiter.js';
import { ErrorHandler } from '../core/error_handler.js';
import logger from '../../../mcp-server/src/logger.js';

export class LinearClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.LINEAR_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.linear.app/graphql';
    this.teamId = config.teamId || process.env.LINEAR_TEAM_ID;
    
    if (!this.apiKey) {
      throw new Error('Linear API key is required. Set LINEAR_API_KEY environment variable.');
    }

    // Initialize rate limiter with Linear's API limits
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 1000, // Linear allows 1000 requests per minute
      burstLimit: 100,
      backoffStrategy: 'exponential',
      maxRetries: 3
    });

    this.errorHandler = new ErrorHandler({
      maxRetries: 3,
      retryDelay: 1000,
      exponentialBackoff: true
    });

    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'AI-CICD-System/1.0'
    };
  }

  /**
   * Execute a GraphQL query with rate limiting and error handling
   */
  async executeQuery(query, variables = {}) {
    return this.rateLimiter.execute(async () => {
      return this.errorHandler.executeWithRetry(async () => {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            query,
            variables
          })
        });

        if (!response.ok) {
          throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.errors) {
          throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
        }

        return data.data;
      });
    });
  }

  /**
   * Get issue by ID
   */
  async getIssue(issueId) {
    const query = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          state {
            id
            name
            type
          }
          assignee {
            id
            name
            email
          }
          team {
            id
            name
            key
          }
          priority
          labels {
            nodes {
              id
              name
              color
            }
          }
          project {
            id
            name
          }
          cycle {
            id
            name
            number
          }
          createdAt
          updatedAt
          url
          branchName
          parent {
            id
            identifier
            title
          }
          children {
            nodes {
              id
              identifier
              title
              state {
                name
                type
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(query, { id: issueId });
      return result.issue;
    } catch (error) {
      logger.error('Failed to get Linear issue:', { issueId, error: error.message });
      throw error;
    }
  }

  /**
   * Update issue status
   */
  async updateIssueStatus(issueId, stateId) {
    const mutation = `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            state {
              id
              name
              type
            }
            updatedAt
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(mutation, {
        id: issueId,
        input: { stateId }
      });

      if (!result.issueUpdate.success) {
        throw new Error('Failed to update issue status');
      }

      logger.info('Issue status updated:', {
        issueId,
        stateId,
        identifier: result.issueUpdate.issue.identifier
      });

      return result.issueUpdate.issue;
    } catch (error) {
      logger.error('Failed to update issue status:', { issueId, stateId, error: error.message });
      throw error;
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(input) {
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            description
            state {
              id
              name
              type
            }
            team {
              id
              name
              key
            }
            url
            createdAt
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(mutation, { input });

      if (!result.issueCreate.success) {
        throw new Error('Failed to create issue');
      }

      logger.info('Issue created:', {
        identifier: result.issueCreate.issue.identifier,
        title: result.issueCreate.issue.title
      });

      return result.issueCreate.issue;
    } catch (error) {
      logger.error('Failed to create issue:', { input, error: error.message });
      throw error;
    }
  }

  /**
   * Add comment to issue
   */
  async addComment(issueId, body) {
    const mutation = `
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
            body
            createdAt
            user {
              name
            }
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(mutation, {
        input: {
          issueId,
          body
        }
      });

      if (!result.commentCreate.success) {
        throw new Error('Failed to create comment');
      }

      logger.info('Comment added to issue:', { issueId, commentId: result.commentCreate.comment.id });
      return result.commentCreate.comment;
    } catch (error) {
      logger.error('Failed to add comment:', { issueId, error: error.message });
      throw error;
    }
  }

  /**
   * Get team workflow states
   */
  async getTeamStates(teamId = this.teamId) {
    const query = `
      query GetTeamStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
              color
              position
            }
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(query, { teamId });
      return result.team.states.nodes;
    } catch (error) {
      logger.error('Failed to get team states:', { teamId, error: error.message });
      throw error;
    }
  }

  /**
   * Search issues with filters
   */
  async searchIssues(filters = {}) {
    const query = `
      query SearchIssues($filter: IssueFilter, $first: Int) {
        issues(filter: $filter, first: $first) {
          nodes {
            id
            identifier
            title
            description
            state {
              id
              name
              type
            }
            assignee {
              id
              name
            }
            team {
              id
              name
              key
            }
            priority
            createdAt
            updatedAt
            url
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(query, {
        filter: filters,
        first: filters.limit || 50
      });

      return result.issues.nodes;
    } catch (error) {
      logger.error('Failed to search issues:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Bulk update issues
   */
  async bulkUpdateIssues(issueIds, updates) {
    const results = [];
    
    // Process in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < issueIds.length; i += batchSize) {
      const batch = issueIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (issueId) => {
        try {
          const result = await this.updateIssue(issueId, updates);
          return { issueId, success: true, result };
        } catch (error) {
          logger.error('Failed to update issue in batch:', { issueId, error: error.message });
          return { issueId, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches
      if (i + batchSize < issueIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Update issue with multiple fields
   */
  async updateIssue(issueId, updates) {
    const mutation = `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            title
            description
            state {
              id
              name
              type
            }
            assignee {
              id
              name
            }
            priority
            updatedAt
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(mutation, {
        id: issueId,
        input: updates
      });

      if (!result.issueUpdate.success) {
        throw new Error('Failed to update issue');
      }

      return result.issueUpdate.issue;
    } catch (error) {
      logger.error('Failed to update issue:', { issueId, updates, error: error.message });
      throw error;
    }
  }

  /**
   * Get issue attachments
   */
  async getIssueAttachments(issueId) {
    const query = `
      query GetIssueAttachments($id: String!) {
        issue(id: $id) {
          attachments {
            nodes {
              id
              title
              url
              subtitle
              metadata
              createdAt
            }
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(query, { id: issueId });
      return result.issue.attachments.nodes;
    } catch (error) {
      logger.error('Failed to get issue attachments:', { issueId, error: error.message });
      throw error;
    }
  }

  /**
   * Create attachment for issue
   */
  async createAttachment(issueId, attachmentData) {
    const mutation = `
      mutation CreateAttachment($input: AttachmentCreateInput!) {
        attachmentCreate(input: $input) {
          success
          attachment {
            id
            title
            url
            subtitle
            createdAt
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(mutation, {
        input: {
          issueId,
          ...attachmentData
        }
      });

      if (!result.attachmentCreate.success) {
        throw new Error('Failed to create attachment');
      }

      logger.info('Attachment created:', {
        issueId,
        attachmentId: result.attachmentCreate.attachment.id,
        title: result.attachmentCreate.attachment.title
      });

      return result.attachmentCreate.attachment;
    } catch (error) {
      logger.error('Failed to create attachment:', { issueId, attachmentData, error: error.message });
      throw error;
    }
  }

  /**
   * Get webhook information
   */
  async getWebhooks() {
    const query = `
      query GetWebhooks {
        webhooks {
          nodes {
            id
            label
            url
            enabled
            resourceTypes
            createdAt
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(query);
      return result.webhooks.nodes;
    } catch (error) {
      logger.error('Failed to get webhooks:', { error: error.message });
      throw error;
    }
  }

  /**
   * Create webhook
   */
  async createWebhook(webhookData) {
    const mutation = `
      mutation CreateWebhook($input: WebhookCreateInput!) {
        webhookCreate(input: $input) {
          success
          webhook {
            id
            label
            url
            enabled
            resourceTypes
            createdAt
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery(mutation, { input: webhookData });

      if (!result.webhookCreate.success) {
        throw new Error('Failed to create webhook');
      }

      logger.info('Webhook created:', {
        webhookId: result.webhookCreate.webhook.id,
        url: result.webhookCreate.webhook.url
      });

      return result.webhookCreate.webhook;
    } catch (error) {
      logger.error('Failed to create webhook:', { webhookData, error: error.message });
      throw error;
    }
  }
}

export default LinearClient;

