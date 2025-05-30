/**
 * Linear API Mock Server
 * 
 * Mock implementation of Linear API for testing
 */

import { jest } from '@jest/globals';

export class LinearMock {
  constructor() {
    this.issues = new Map();
    this.webhooks = [];
    this.teams = new Map();
    this.projects = new Map();
    this.users = new Map();
    
    this.setupDefaultData();
  }

  setupDefaultData() {
    // Default teams
    this.teams.set('team-1', {
      id: 'team-1',
      name: 'Engineering',
      key: 'ENG',
      description: 'Engineering team'
    });

    // Default users
    this.users.set('user-1', {
      id: 'user-1',
      name: 'Test Developer',
      email: 'test@example.com',
      active: true
    });

    // Default projects
    this.projects.set('project-1', {
      id: 'project-1',
      name: 'Test Project',
      description: 'Test project for development',
      teamId: 'team-1'
    });
  }

  /**
   * Mock Linear API endpoints
   */
  mockAPI() {
    const mockFetch = jest.fn().mockImplementation((url, options) => {
      const method = options?.method || 'GET';
      const body = options?.body ? JSON.parse(options.body) : null;

      // Parse URL to determine endpoint
      if (url.includes('/issues')) {
        return this.handleIssuesEndpoint(method, body, url);
      } else if (url.includes('/webhooks')) {
        return this.handleWebhooksEndpoint(method, body, url);
      } else if (url.includes('/teams')) {
        return this.handleTeamsEndpoint(method, body, url);
      } else if (url.includes('/projects')) {
        return this.handleProjectsEndpoint(method, body, url);
      } else if (url.includes('/users')) {
        return this.handleUsersEndpoint(method, body, url);
      }

      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Endpoint not found' })
      });
    });

    global.fetch = mockFetch;
    return mockFetch;
  }

  handleIssuesEndpoint(method, body, url) {
    switch (method) {
      case 'POST':
        return this.createIssue(body);
      case 'GET':
        const issueId = this.extractIdFromUrl(url);
        return issueId ? this.getIssue(issueId) : this.listIssues();
      case 'PUT':
      case 'PATCH':
        const updateId = this.extractIdFromUrl(url);
        return this.updateIssue(updateId, body);
      case 'DELETE':
        const deleteId = this.extractIdFromUrl(url);
        return this.deleteIssue(deleteId);
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleWebhooksEndpoint(method, body, url) {
    switch (method) {
      case 'POST':
        return this.processWebhook(body);
      case 'GET':
        return this.listWebhooks();
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleTeamsEndpoint(method, body, url) {
    switch (method) {
      case 'GET':
        const teamId = this.extractIdFromUrl(url);
        return teamId ? this.getTeam(teamId) : this.listTeams();
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleProjectsEndpoint(method, body, url) {
    switch (method) {
      case 'GET':
        const projectId = this.extractIdFromUrl(url);
        return projectId ? this.getProject(projectId) : this.listProjects();
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleUsersEndpoint(method, body, url) {
    switch (method) {
      case 'GET':
        const userId = this.extractIdFromUrl(url);
        return userId ? this.getUser(userId) : this.listUsers();
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  createIssue(data) {
    const issue = {
      id: `issue-${Date.now()}`,
      title: data.title,
      description: data.description || '',
      status: data.status || 'backlog',
      priority: data.priority || 'medium',
      assigneeId: data.assigneeId || null,
      teamId: data.teamId || 'team-1',
      projectId: data.projectId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.issues.set(issue.id, issue);

    return Promise.resolve({
      ok: true,
      status: 201,
      json: () => Promise.resolve({
        data: { issueCreate: { issue, success: true } }
      })
    });
  }

  getIssue(id) {
    const issue = this.issues.get(id);
    
    if (!issue) {
      return this.errorResponse(404, 'Issue not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { issue }
      })
    });
  }

  listIssues() {
    const issues = Array.from(this.issues.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { 
          issues: {
            nodes: issues,
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false
            }
          }
        }
      })
    });
  }

  updateIssue(id, data) {
    const issue = this.issues.get(id);
    
    if (!issue) {
      return this.errorResponse(404, 'Issue not found');
    }

    const updatedIssue = {
      ...issue,
      ...data,
      updatedAt: new Date().toISOString()
    };

    this.issues.set(id, updatedIssue);

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { issueUpdate: { issue: updatedIssue, success: true } }
      })
    });
  }

  deleteIssue(id) {
    const deleted = this.issues.delete(id);
    
    if (!deleted) {
      return this.errorResponse(404, 'Issue not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { issueDelete: { success: true } }
      })
    });
  }

  processWebhook(data) {
    this.webhooks.push({
      id: `webhook-${Date.now()}`,
      type: data.type,
      action: data.action,
      data: data.data,
      timestamp: new Date().toISOString()
    });

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        processed: true
      })
    });
  }

  listWebhooks() {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { webhooks: this.webhooks }
      })
    });
  }

  getTeam(id) {
    const team = this.teams.get(id);
    
    if (!team) {
      return this.errorResponse(404, 'Team not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { team }
      })
    });
  }

  listTeams() {
    const teams = Array.from(this.teams.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { teams: { nodes: teams } }
      })
    });
  }

  getProject(id) {
    const project = this.projects.get(id);
    
    if (!project) {
      return this.errorResponse(404, 'Project not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { project }
      })
    });
  }

  listProjects() {
    const projects = Array.from(this.projects.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { projects: { nodes: projects } }
      })
    });
  }

  getUser(id) {
    const user = this.users.get(id);
    
    if (!user) {
      return this.errorResponse(404, 'User not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { user }
      })
    });
  }

  listUsers() {
    const users = Array.from(this.users.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: { users: { nodes: users } }
      })
    });
  }

  extractIdFromUrl(url) {
    const matches = url.match(/\/([^\/]+)$/);
    return matches ? matches[1] : null;
  }

  errorResponse(status, message) {
    return Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({
        error: message,
        status
      })
    });
  }

  reset() {
    this.issues.clear();
    this.webhooks = [];
    this.teams.clear();
    this.projects.clear();
    this.users.clear();
    this.setupDefaultData();
  }

  // Utility methods for testing
  addIssue(issue) {
    this.issues.set(issue.id, issue);
  }

  getIssueCount() {
    return this.issues.size;
  }

  getWebhookCount() {
    return this.webhooks.length;
  }
}

export default LinearMock;

