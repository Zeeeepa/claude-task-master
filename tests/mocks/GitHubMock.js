/**
 * GitHub API Mock Server
 * 
 * Mock implementation of GitHub API for testing
 */

import { jest } from '@jest/globals';

export class GitHubMock {
  constructor() {
    this.repositories = new Map();
    this.pullRequests = new Map();
    this.issues = new Map();
    this.webhooks = [];
    this.commits = new Map();
    this.branches = new Map();
    
    this.setupDefaultData();
  }

  setupDefaultData() {
    // Default repository
    this.repositories.set('test-repo', {
      id: 1,
      name: 'test-repo',
      full_name: 'test-org/test-repo',
      description: 'Test repository for development',
      private: false,
      default_branch: 'main',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });

    // Default branch
    this.branches.set('main', {
      name: 'main',
      commit: {
        sha: 'abc123def456',
        url: 'https://api.github.com/repos/test-org/test-repo/commits/abc123def456'
      },
      protected: true
    });
  }

  /**
   * Mock GitHub API endpoints
   */
  mockAPI() {
    const mockFetch = jest.fn().mockImplementation((url, options) => {
      const method = options?.method || 'GET';
      const body = options?.body ? JSON.parse(options.body) : null;

      // Parse URL to determine endpoint
      if (url.includes('/pulls')) {
        return this.handlePullRequestsEndpoint(method, body, url);
      } else if (url.includes('/issues')) {
        return this.handleIssuesEndpoint(method, body, url);
      } else if (url.includes('/repos')) {
        return this.handleRepositoriesEndpoint(method, body, url);
      } else if (url.includes('/commits')) {
        return this.handleCommitsEndpoint(method, body, url);
      } else if (url.includes('/branches')) {
        return this.handleBranchesEndpoint(method, body, url);
      } else if (url.includes('/webhooks')) {
        return this.handleWebhooksEndpoint(method, body, url);
      }

      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not Found' })
      });
    });

    global.fetch = mockFetch;
    return mockFetch;
  }

  handlePullRequestsEndpoint(method, body, url) {
    switch (method) {
      case 'POST':
        return this.createPullRequest(body);
      case 'GET':
        const prNumber = this.extractNumberFromUrl(url);
        return prNumber ? this.getPullRequest(prNumber) : this.listPullRequests();
      case 'PATCH':
        const updateNumber = this.extractNumberFromUrl(url);
        return this.updatePullRequest(updateNumber, body);
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleIssuesEndpoint(method, body, url) {
    switch (method) {
      case 'POST':
        return this.createIssue(body);
      case 'GET':
        const issueNumber = this.extractNumberFromUrl(url);
        return issueNumber ? this.getIssue(issueNumber) : this.listIssues();
      case 'PATCH':
        const updateNumber = this.extractNumberFromUrl(url);
        return this.updateIssue(updateNumber, body);
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleRepositoriesEndpoint(method, body, url) {
    switch (method) {
      case 'GET':
        const repoName = this.extractRepoFromUrl(url);
        return repoName ? this.getRepository(repoName) : this.listRepositories();
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleCommitsEndpoint(method, body, url) {
    switch (method) {
      case 'GET':
        const commitSha = this.extractCommitFromUrl(url);
        return commitSha ? this.getCommit(commitSha) : this.listCommits();
      default:
        return this.errorResponse(405, 'Method not allowed');
    }
  }

  handleBranchesEndpoint(method, body, url) {
    switch (method) {
      case 'GET':
        const branchName = this.extractBranchFromUrl(url);
        return branchName ? this.getBranch(branchName) : this.listBranches();
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

  createPullRequest(data) {
    const pr = {
      id: Date.now(),
      number: this.pullRequests.size + 1,
      title: data.title,
      body: data.body || '',
      state: 'open',
      head: {
        ref: data.head,
        sha: `sha-${Date.now()}`
      },
      base: {
        ref: data.base,
        sha: 'abc123def456'
      },
      user: {
        login: 'test-user',
        id: 1
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      html_url: `https://github.com/test-org/test-repo/pull/${this.pullRequests.size + 1}`,
      diff_url: `https://github.com/test-org/test-repo/pull/${this.pullRequests.size + 1}.diff`,
      patch_url: `https://github.com/test-org/test-repo/pull/${this.pullRequests.size + 1}.patch`
    };

    this.pullRequests.set(pr.number, pr);

    return Promise.resolve({
      ok: true,
      status: 201,
      json: () => Promise.resolve(pr)
    });
  }

  getPullRequest(number) {
    const pr = this.pullRequests.get(number);
    
    if (!pr) {
      return this.errorResponse(404, 'Pull request not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(pr)
    });
  }

  listPullRequests() {
    const prs = Array.from(this.pullRequests.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(prs)
    });
  }

  updatePullRequest(number, data) {
    const pr = this.pullRequests.get(number);
    
    if (!pr) {
      return this.errorResponse(404, 'Pull request not found');
    }

    const updatedPr = {
      ...pr,
      ...data,
      updated_at: new Date().toISOString()
    };

    this.pullRequests.set(number, updatedPr);

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(updatedPr)
    });
  }

  createIssue(data) {
    const issue = {
      id: Date.now(),
      number: this.issues.size + 1,
      title: data.title,
      body: data.body || '',
      state: 'open',
      labels: data.labels || [],
      assignees: data.assignees || [],
      user: {
        login: 'test-user',
        id: 1
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      html_url: `https://github.com/test-org/test-repo/issues/${this.issues.size + 1}`
    };

    this.issues.set(issue.number, issue);

    return Promise.resolve({
      ok: true,
      status: 201,
      json: () => Promise.resolve(issue)
    });
  }

  getIssue(number) {
    const issue = this.issues.get(number);
    
    if (!issue) {
      return this.errorResponse(404, 'Issue not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(issue)
    });
  }

  listIssues() {
    const issues = Array.from(this.issues.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(issues)
    });
  }

  updateIssue(number, data) {
    const issue = this.issues.get(number);
    
    if (!issue) {
      return this.errorResponse(404, 'Issue not found');
    }

    const updatedIssue = {
      ...issue,
      ...data,
      updated_at: new Date().toISOString()
    };

    this.issues.set(number, updatedIssue);

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(updatedIssue)
    });
  }

  getRepository(name) {
    const repo = this.repositories.get(name);
    
    if (!repo) {
      return this.errorResponse(404, 'Repository not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(repo)
    });
  }

  listRepositories() {
    const repos = Array.from(this.repositories.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(repos)
    });
  }

  getCommit(sha) {
    const commit = this.commits.get(sha) || {
      sha,
      commit: {
        message: 'Test commit message',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date().toISOString()
        }
      },
      author: {
        login: 'test-user',
        id: 1
      },
      html_url: `https://github.com/test-org/test-repo/commit/${sha}`
    };

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(commit)
    });
  }

  listCommits() {
    const commits = Array.from(this.commits.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(commits)
    });
  }

  getBranch(name) {
    const branch = this.branches.get(name);
    
    if (!branch) {
      return this.errorResponse(404, 'Branch not found');
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(branch)
    });
  }

  listBranches() {
    const branches = Array.from(this.branches.values());
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(branches)
    });
  }

  processWebhook(data) {
    this.webhooks.push({
      id: `webhook-${Date.now()}`,
      action: data.action,
      repository: data.repository,
      sender: data.sender,
      timestamp: new Date().toISOString(),
      ...data
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
      json: () => Promise.resolve(this.webhooks)
    });
  }

  extractNumberFromUrl(url) {
    const matches = url.match(/\/(\d+)$/);
    return matches ? parseInt(matches[1], 10) : null;
  }

  extractRepoFromUrl(url) {
    const matches = url.match(/\/repos\/[^\/]+\/([^\/]+)/);
    return matches ? matches[1] : null;
  }

  extractCommitFromUrl(url) {
    const matches = url.match(/\/commits\/([^\/]+)$/);
    return matches ? matches[1] : null;
  }

  extractBranchFromUrl(url) {
    const matches = url.match(/\/branches\/([^\/]+)$/);
    return matches ? matches[1] : null;
  }

  errorResponse(status, message) {
    return Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({
        message,
        status
      })
    });
  }

  reset() {
    this.repositories.clear();
    this.pullRequests.clear();
    this.issues.clear();
    this.webhooks = [];
    this.commits.clear();
    this.branches.clear();
    this.setupDefaultData();
  }

  // Utility methods for testing
  addRepository(repo) {
    this.repositories.set(repo.name, repo);
  }

  addPullRequest(pr) {
    this.pullRequests.set(pr.number, pr);
  }

  addIssue(issue) {
    this.issues.set(issue.number, issue);
  }

  getPullRequestCount() {
    return this.pullRequests.size;
  }

  getIssueCount() {
    return this.issues.size;
  }

  getWebhookCount() {
    return this.webhooks.length;
  }
}

export default GitHubMock;

