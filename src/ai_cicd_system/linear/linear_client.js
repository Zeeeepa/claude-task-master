/**
 * Linear API Client
 * 
 * Provides a comprehensive interface to Linear's GraphQL API with rate limiting,
 * error handling, and integration with the existing task management system.
 */

import fetch from 'node-fetch';
import { readJSON } from '../../../scripts/modules/utils.js';
import logger from '../../../mcp-server/src/logger.js';

export class LinearClient {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.LINEAR_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.linear.app/graphql';
    this.teamId = config.teamId || process.env.LINEAR_TEAM_ID;
    
    // Rate limiting
    this.rateLimiter = {
      requests: [],
      maxRequests: config.rateLimiting?.requestsPerMinute || 1000,
      windowMs: 60000,
      retryDelay: 1000,
      maxRetries: config.rateLimiting?.maxRetries || 3
    };
    
    // Request queue for rate limiting
    this.requestQueue = [];
    this.processing = false;
    
    if (!this.apiKey) {
      throw new Error('Linear API key is required. Set LINEAR_API_KEY environment variable.');
    }
  }

  /**
   * Make a GraphQL request to Linear API
   */
  async request(query, variables = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ query, variables, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  async processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      // Check rate limit
      const now = Date.now();
      this.rateLimiter.requests = this.rateLimiter.requests.filter(
        time => now - time < this.rateLimiter.windowMs
      );

      if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
        // Wait before processing next request
        await new Promise(resolve => setTimeout(resolve, this.rateLimiter.retryDelay));
        continue;
      }

      const { query, variables, resolve, reject } = this.requestQueue.shift();
      
      try {
        const result = await this.makeRequest(query, variables);
        this.rateLimiter.requests.push(now);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * Make the actual HTTP request
   */
  async makeRequest(query, variables = {}) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Linear GraphQL error: ${data.errors.map(e => e.message).join(', ')}`);
    }

    return data.data;
  }

  /**
   * Get issue details by ID
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
          priority
          estimate
          createdAt
          updatedAt
          team {
            id
            name
          }
          project {
            id
            name
          }
          cycle {
            id
            name
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
          comments {
            nodes {
              id
              body
              createdAt
              user {
                id
                name
              }
            }
          }
        }
      }
    `;

    const result = await this.request(query, { id: issueId });
    return result.issue;
  }

  /**
   * Update issue status
   */
  async updateIssueStatus(issueId, stateId) {
    const query = `
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
          }
        }
      }
    `;

    const result = await this.request(query, {
      id: issueId,
      input: { stateId }
    });

    return result.issueUpdate;
  }

  /**
   * Create a new issue
   */
  async createIssue(input) {
    const query = `
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
            assignee {
              id
              name
            }
            team {
              id
              name
            }
          }
        }
      }
    `;

    const result = await this.request(query, { input });
    return result.issueCreate;
  }

  /**
   * Add comment to issue
   */
  async addComment(issueId, body) {
    const query = `
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
            body
            createdAt
            user {
              id
              name
            }
          }
        }
      }
    `;

    const result = await this.request(query, {
      input: {
        issueId,
        body
      }
    });

    return result.commentCreate;
  }

  /**
   * Get team states
   */
  async getTeamStates(teamId = null) {
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

    const result = await this.request(query, { 
      teamId: teamId || this.teamId 
    });
    
    return result.team.states.nodes;
  }

  /**
   * Search issues by filters
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
            priority
            estimate
            createdAt
            updatedAt
          }
        }
      }
    `;

    const result = await this.request(query, {
      filter: filters,
      first: filters.limit || 50
    });

    return result.issues.nodes;
  }

  /**
   * Bulk update issues
   */
  async bulkUpdateIssues(issueIds, updates) {
    const results = [];
    
    for (const issueId of issueIds) {
      try {
        const result = await this.updateIssue(issueId, updates);
        results.push({ issueId, success: true, result });
      } catch (error) {
        results.push({ issueId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Update issue with multiple fields
   */
  async updateIssue(issueId, updates) {
    const query = `
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
            estimate
          }
        }
      }
    `;

    const result = await this.request(query, {
      id: issueId,
      input: updates
    });

    return result.issueUpdate;
  }

  /**
   * Get issue history/activity
   */
  async getIssueHistory(issueId) {
    const query = `
      query GetIssueHistory($id: String!) {
        issue(id: $id) {
          history {
            nodes {
              id
              createdAt
              actor {
                id
                name
              }
              fromState {
                id
                name
              }
              toState {
                id
                name
              }
              changes
            }
          }
        }
      }
    `;

    const result = await this.request(query, { id: issueId });
    return result.issue.history.nodes;
  }

  /**
   * Sync with task master - get Linear issue for task
   */
  async getLinearIssueForTask(taskId) {
    // Search for issues with task ID in title or description
    const issues = await this.searchIssues({
      title: { contains: `Task ${taskId}` }
    });

    return issues.find(issue => 
      issue.title.includes(`Task ${taskId}`) || 
      issue.description?.includes(`task-master-id:${taskId}`)
    );
  }

  /**
   * Create Linear issue from task master task
   */
  async createIssueFromTask(task, options = {}) {
    const title = `Task ${task.id}: ${task.title}`;
    const description = `${task.description || ''}\n\n---\ntask-master-id:${task.id}`;
    
    const input = {
      teamId: options.teamId || this.teamId,
      title,
      description,
      priority: this.mapTaskPriorityToLinear(task.priority),
      ...options.additionalFields
    };

    return await this.createIssue(input);
  }

  /**
   * Map task master priority to Linear priority
   */
  mapTaskPriorityToLinear(taskPriority) {
    const priorityMap = {
      1: 1, // Low
      2: 2, // Medium  
      3: 3, // High
      4: 4  // Urgent
    };
    
    return priorityMap[taskPriority] || 2;
  }

  /**
   * Map task master status to Linear state
   */
  mapTaskStatusToLinearState(status, stateMapping = {}) {
    const defaultMapping = {
      'pending': 'backlog',
      'in-progress': 'in_progress',
      'done': 'done',
      'deferred': 'blocked',
      'cancelled': 'cancelled'
    };

    const mapping = { ...defaultMapping, ...stateMapping };
    return mapping[status] || 'backlog';
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const query = `
        query HealthCheck {
          viewer {
            id
            name
          }
        }
      `;
      
      const result = await this.request(query);
      return {
        status: 'healthy',
        user: result.viewer
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

export default LinearClient;

