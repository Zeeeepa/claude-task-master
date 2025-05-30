/**
 * Workflow Test Fixtures
 * 
 * Sample workflow data for testing
 */

export const sampleWorkflow = {
  id: 'test-workflow-1',
  githubRepoUrl: 'https://github.com/test/repo',
  requirements: 'Implement user authentication system with JWT tokens, password hashing, and role-based access control',
  status: 'active',
  priority: 'high',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  metadata: {
    branch: 'feature/auth-system',
    lastCommit: 'abc123def456',
    author: 'test-developer',
    estimatedHours: 40,
    actualHours: 0
  }
};

export const completedWorkflow = {
  id: 'test-workflow-2',
  githubRepoUrl: 'https://github.com/test/completed-repo',
  requirements: 'Add API rate limiting and request throttling',
  status: 'completed',
  priority: 'medium',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  completedAt: '2024-01-02T00:00:00.000Z',
  metadata: {
    branch: 'feature/rate-limiting',
    lastCommit: 'def456ghi789',
    author: 'test-developer',
    estimatedHours: 16,
    actualHours: 18
  }
};

export const failedWorkflow = {
  id: 'test-workflow-3',
  githubRepoUrl: 'https://github.com/test/failed-repo',
  requirements: 'Integrate with external payment API',
  status: 'failed',
  priority: 'high',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T12:00:00.000Z',
  failedAt: '2024-01-01T12:00:00.000Z',
  error: 'API integration failed due to authentication issues',
  metadata: {
    branch: 'feature/payment-integration',
    lastCommit: 'ghi789jkl012',
    author: 'test-developer',
    estimatedHours: 24,
    actualHours: 12
  }
};

export const pausedWorkflow = {
  id: 'test-workflow-4',
  githubRepoUrl: 'https://github.com/test/paused-repo',
  requirements: 'Implement real-time notifications system',
  status: 'paused',
  priority: 'low',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T08:00:00.000Z',
  pausedAt: '2024-01-01T08:00:00.000Z',
  pauseReason: 'Waiting for external dependency',
  metadata: {
    branch: 'feature/notifications',
    lastCommit: 'jkl012mno345',
    author: 'test-developer',
    estimatedHours: 32,
    actualHours: 8
  }
};

export const workflowWithTasks = {
  id: 'test-workflow-5',
  githubRepoUrl: 'https://github.com/test/workflow-with-tasks',
  requirements: 'Build comprehensive dashboard with analytics',
  status: 'active',
  priority: 'high',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  metadata: {
    branch: 'feature/dashboard',
    lastCommit: 'mno345pqr678',
    author: 'test-developer',
    estimatedHours: 60,
    actualHours: 20
  },
  tasks: [
    {
      id: 'task-1',
      title: 'Design dashboard layout',
      status: 'completed',
      priority: 'high'
    },
    {
      id: 'task-2',
      title: 'Implement data visualization components',
      status: 'active',
      priority: 'high'
    },
    {
      id: 'task-3',
      title: 'Add real-time data updates',
      status: 'pending',
      priority: 'medium'
    }
  ]
};

export const workflowCollection = [
  sampleWorkflow,
  completedWorkflow,
  failedWorkflow,
  pausedWorkflow,
  workflowWithTasks
];

export const workflowStatuses = [
  'pending',
  'active',
  'paused',
  'completed',
  'failed',
  'cancelled'
];

export const workflowPriorities = [
  'low',
  'medium',
  'high',
  'critical'
];

export default {
  sampleWorkflow,
  completedWorkflow,
  failedWorkflow,
  pausedWorkflow,
  workflowWithTasks,
  workflowCollection,
  workflowStatuses,
  workflowPriorities
};

