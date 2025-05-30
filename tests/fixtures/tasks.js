/**
 * Task Test Fixtures
 * 
 * Sample task data for testing
 */

export const sampleTask = {
  id: 'test-task-1',
  workflowId: 'test-workflow-1',
  title: 'Implement user authentication',
  description: 'Create JWT-based authentication system with login/logout functionality',
  status: 'pending',
  priority: 'high',
  type: 'feature',
  assignee: 'test-developer',
  estimatedHours: 8,
  actualHours: 0,
  dependencies: [],
  tags: ['authentication', 'security', 'backend'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

export const activeTask = {
  id: 'test-task-2',
  workflowId: 'test-workflow-1',
  title: 'Design user interface components',
  description: 'Create reusable UI components for the authentication system',
  status: 'active',
  priority: 'medium',
  type: 'feature',
  assignee: 'test-designer',
  estimatedHours: 12,
  actualHours: 4,
  dependencies: ['test-task-1'],
  tags: ['ui', 'frontend', 'components'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T04:00:00.000Z',
  startedAt: '2024-01-01T02:00:00.000Z'
};

export const completedTask = {
  id: 'test-task-3',
  workflowId: 'test-workflow-2',
  title: 'Setup database schema',
  description: 'Create and migrate database tables for user management',
  status: 'completed',
  priority: 'high',
  type: 'infrastructure',
  assignee: 'test-developer',
  estimatedHours: 4,
  actualHours: 3,
  dependencies: [],
  tags: ['database', 'migration', 'backend'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T03:00:00.000Z',
  startedAt: '2024-01-01T01:00:00.000Z',
  completedAt: '2024-01-01T03:00:00.000Z'
};

export const blockedTask = {
  id: 'test-task-4',
  workflowId: 'test-workflow-1',
  title: 'Implement password reset functionality',
  description: 'Add email-based password reset with secure tokens',
  status: 'blocked',
  priority: 'medium',
  type: 'feature',
  assignee: 'test-developer',
  estimatedHours: 6,
  actualHours: 0,
  dependencies: ['test-task-1', 'test-task-3'],
  tags: ['authentication', 'email', 'security'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  blockedReason: 'Waiting for authentication system completion'
};

export const failedTask = {
  id: 'test-task-5',
  workflowId: 'test-workflow-3',
  title: 'Integrate payment gateway',
  description: 'Connect with Stripe API for payment processing',
  status: 'failed',
  priority: 'high',
  type: 'integration',
  assignee: 'test-developer',
  estimatedHours: 10,
  actualHours: 8,
  dependencies: [],
  tags: ['payment', 'api', 'integration'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T08:00:00.000Z',
  startedAt: '2024-01-01T02:00:00.000Z',
  failedAt: '2024-01-01T08:00:00.000Z',
  error: 'API authentication failed - invalid credentials'
};

export const subtask = {
  id: 'test-subtask-1',
  parentTaskId: 'test-task-1',
  workflowId: 'test-workflow-1',
  title: 'Create user model',
  description: 'Define user data model with validation',
  status: 'completed',
  priority: 'high',
  type: 'subtask',
  assignee: 'test-developer',
  estimatedHours: 2,
  actualHours: 1.5,
  dependencies: [],
  tags: ['model', 'backend', 'validation'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T01:30:00.000Z',
  startedAt: '2024-01-01T00:30:00.000Z',
  completedAt: '2024-01-01T01:30:00.000Z'
};

export const taskWithSubtasks = {
  id: 'test-task-6',
  workflowId: 'test-workflow-5',
  title: 'Build analytics dashboard',
  description: 'Create comprehensive analytics dashboard with charts and metrics',
  status: 'active',
  priority: 'high',
  type: 'feature',
  assignee: 'test-developer',
  estimatedHours: 20,
  actualHours: 8,
  dependencies: [],
  tags: ['analytics', 'dashboard', 'frontend'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T08:00:00.000Z',
  startedAt: '2024-01-01T02:00:00.000Z',
  subtasks: [
    {
      id: 'test-subtask-2',
      title: 'Design dashboard layout',
      status: 'completed',
      estimatedHours: 4,
      actualHours: 3
    },
    {
      id: 'test-subtask-3',
      title: 'Implement chart components',
      status: 'active',
      estimatedHours: 8,
      actualHours: 4
    },
    {
      id: 'test-subtask-4',
      title: 'Add data filtering',
      status: 'pending',
      estimatedHours: 4,
      actualHours: 0
    }
  ]
};

export const taskCollection = [
  sampleTask,
  activeTask,
  completedTask,
  blockedTask,
  failedTask,
  subtask,
  taskWithSubtasks
];

export const taskStatuses = [
  'pending',
  'active',
  'blocked',
  'completed',
  'failed',
  'cancelled'
];

export const taskTypes = [
  'feature',
  'bug',
  'infrastructure',
  'integration',
  'subtask',
  'documentation',
  'testing'
];

export const taskPriorities = [
  'low',
  'medium',
  'high',
  'critical'
];

export default {
  sampleTask,
  activeTask,
  completedTask,
  blockedTask,
  failedTask,
  subtask,
  taskWithSubtasks,
  taskCollection,
  taskStatuses,
  taskTypes,
  taskPriorities
};

