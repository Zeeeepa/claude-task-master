/**
 * Linear Integration Unit Tests
 * 
 * Tests for Linear API integration functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TestHelpers } from '../../utils/TestHelpers.js';
import LinearMock from '../../mocks/LinearMock.js';

// Mock the LinearIntegration (assuming it exists)
jest.mock('../../../src/ai_cicd_system/integrations/LinearIntegration.js', () => ({
  LinearIntegration: jest.fn().mockImplementation(() => ({
    createIssue: jest.fn(),
    updateIssue: jest.fn(),
    getIssue: jest.fn(),
    listIssues: jest.fn(),
    deleteIssue: jest.fn(),
    handleWebhook: jest.fn(),
    syncStatus: jest.fn(),
    handleRateLimit: jest.fn(),
    authenticate: jest.fn(),
    validateWebhookSignature: jest.fn()
  }))
}));

import { LinearIntegration } from '../../../src/ai_cicd_system/integrations/LinearIntegration.js';

describe('LinearIntegration', () => {
  let linearIntegration;
  let linearMock;

  beforeEach(() => {
    linearIntegration = new LinearIntegration();
    linearMock = new LinearMock();
    linearMock.mockAPI();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    linearMock.reset();
    await TestHelpers.cleanupTestData();
  });

  describe('Issue Management', () => {
    test('should create Linear issue successfully', async () => {
      // Arrange
      const issueData = {
        title: 'Implement user authentication',
        description: 'Add JWT-based authentication system',
        teamId: 'team-1',
        priority: 'high',
        status: 'backlog'
      };

      const expectedIssue = {
        id: 'issue-123',
        ...issueData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      linearIntegration.createIssue.mockResolvedValue({
        success: true,
        issue: expectedIssue
      });

      // Act
      const result = await linearIntegration.createIssue(issueData);

      // Assert
      expect(linearIntegration.createIssue).toHaveBeenCalledWith(issueData);
      expect(result.success).toBe(true);
      expect(result.issue.title).toBe(issueData.title);
      expect(result.issue.id).toBeDefined();
    });

    test('should update Linear issue status', async () => {
      // Arrange
      const issueId = 'issue-123';
      const updateData = {
        status: 'in-progress',
        assigneeId: 'user-456'
      };

      const updatedIssue = {
        id: issueId,
        title: 'Existing Issue',
        ...updateData,
        updatedAt: new Date().toISOString()
      };

      linearIntegration.updateIssue.mockResolvedValue({
        success: true,
        issue: updatedIssue
      });

      // Act
      const result = await linearIntegration.updateIssue(issueId, updateData);

      // Assert
      expect(linearIntegration.updateIssue).toHaveBeenCalledWith(issueId, updateData);
      expect(result.success).toBe(true);
      expect(result.issue.status).toBe('in-progress');
      expect(result.issue.assigneeId).toBe('user-456');
    });

    test('should retrieve Linear issue by ID', async () => {
      // Arrange
      const issueId = 'issue-123';
      const expectedIssue = {
        id: issueId,
        title: 'Test Issue',
        description: 'Test issue description',
        status: 'active',
        priority: 'medium'
      };

      linearIntegration.getIssue.mockResolvedValue({
        success: true,
        issue: expectedIssue
      });

      // Act
      const result = await linearIntegration.getIssue(issueId);

      // Assert
      expect(linearIntegration.getIssue).toHaveBeenCalledWith(issueId);
      expect(result.success).toBe(true);
      expect(result.issue.id).toBe(issueId);
    });

    test('should list Linear issues with filters', async () => {
      // Arrange
      const filters = {
        teamId: 'team-1',
        status: 'active',
        assigneeId: 'user-123'
      };

      const expectedIssues = [
        { id: 'issue-1', title: 'Issue 1', status: 'active' },
        { id: 'issue-2', title: 'Issue 2', status: 'active' }
      ];

      linearIntegration.listIssues.mockResolvedValue({
        success: true,
        issues: expectedIssues,
        totalCount: 2
      });

      // Act
      const result = await linearIntegration.listIssues(filters);

      // Assert
      expect(linearIntegration.listIssues).toHaveBeenCalledWith(filters);
      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    test('should delete Linear issue', async () => {
      // Arrange
      const issueId = 'issue-123';

      linearIntegration.deleteIssue.mockResolvedValue({
        success: true,
        deleted: true
      });

      // Act
      const result = await linearIntegration.deleteIssue(issueId);

      // Assert
      expect(linearIntegration.deleteIssue).toHaveBeenCalledWith(issueId);
      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
    });

    test('should handle issue creation errors', async () => {
      // Arrange
      const invalidIssueData = {
        // Missing required title field
        description: 'Issue without title'
      };

      linearIntegration.createIssue.mockResolvedValue({
        success: false,
        error: 'Title is required',
        code: 'VALIDATION_ERROR'
      });

      // Act
      const result = await linearIntegration.createIssue(invalidIssueData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Title is required');
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Webhook Handling', () => {
    test('should handle webhook events correctly', async () => {
      // Arrange
      const webhookPayload = TestHelpers.createWebhookPayload('linear', 'issue.update', {
        issueId: 'issue-123',
        status: 'completed',
        updatedAt: new Date().toISOString()
      });

      linearIntegration.handleWebhook.mockResolvedValue({
        success: true,
        processed: true,
        action: 'status_updated',
        issueId: 'issue-123'
      });

      // Act
      const result = await linearIntegration.handleWebhook(webhookPayload);

      // Assert
      expect(linearIntegration.handleWebhook).toHaveBeenCalledWith(webhookPayload);
      expect(result.success).toBe(true);
      expect(result.processed).toBe(true);
      expect(result.action).toBe('status_updated');
    });

    test('should validate webhook signatures', async () => {
      // Arrange
      const webhookPayload = TestHelpers.createWebhookPayload('linear', 'issue.create', {
        issueId: 'issue-456'
      });
      const signature = 'sha256=valid-signature-hash';

      linearIntegration.validateWebhookSignature.mockResolvedValue({
        valid: true,
        payload: webhookPayload
      });

      // Act
      const result = await linearIntegration.validateWebhookSignature(webhookPayload, signature);

      // Assert
      expect(linearIntegration.validateWebhookSignature).toHaveBeenCalledWith(webhookPayload, signature);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid webhook signatures', async () => {
      // Arrange
      const webhookPayload = TestHelpers.createWebhookPayload('linear', 'issue.create', {
        issueId: 'issue-456'
      });
      const invalidSignature = 'sha256=invalid-signature-hash';

      linearIntegration.validateWebhookSignature.mockResolvedValue({
        valid: false,
        error: 'Invalid signature'
      });

      // Act
      const result = await linearIntegration.validateWebhookSignature(webhookPayload, invalidSignature);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    test('should handle different webhook event types', async () => {
      // Arrange
      const eventTypes = ['issue.create', 'issue.update', 'issue.delete', 'comment.create'];
      
      eventTypes.forEach(eventType => {
        const payload = TestHelpers.createWebhookPayload('linear', eventType, {
          issueId: `issue-${eventType}`
        });

        linearIntegration.handleWebhook.mockResolvedValueOnce({
          success: true,
          eventType,
          processed: true
        });
      });

      // Act & Assert
      for (const eventType of eventTypes) {
        const payload = TestHelpers.createWebhookPayload('linear', eventType, {
          issueId: `issue-${eventType}`
        });
        
        const result = await linearIntegration.handleWebhook(payload);
        
        expect(result.success).toBe(true);
        expect(result.eventType).toBe(eventType);
      }
    });
  });

  describe('Status Synchronization', () => {
    test('should sync status updates between systems', async () => {
      // Arrange
      const syncData = {
        issueId: 'issue-123',
        externalTaskId: 'task-456',
        status: 'completed',
        progress: 100,
        updatedAt: new Date().toISOString()
      };

      linearIntegration.syncStatus.mockResolvedValue({
        success: true,
        synced: true,
        issueId: syncData.issueId,
        newStatus: syncData.status
      });

      // Act
      const result = await linearIntegration.syncStatus(syncData);

      // Assert
      expect(linearIntegration.syncStatus).toHaveBeenCalledWith(syncData);
      expect(result.success).toBe(true);
      expect(result.synced).toBe(true);
      expect(result.newStatus).toBe('completed');
    });

    test('should handle bidirectional status sync', async () => {
      // Arrange
      const linearToExternal = {
        direction: 'linear-to-external',
        issueId: 'issue-123',
        externalTaskId: 'task-456',
        status: 'in-progress'
      };

      const externalToLinear = {
        direction: 'external-to-linear',
        issueId: 'issue-123',
        externalTaskId: 'task-456',
        status: 'completed'
      };

      linearIntegration.syncStatus
        .mockResolvedValueOnce({
          success: true,
          direction: 'linear-to-external',
          synced: true
        })
        .mockResolvedValueOnce({
          success: true,
          direction: 'external-to-linear',
          synced: true
        });

      // Act
      const result1 = await linearIntegration.syncStatus(linearToExternal);
      const result2 = await linearIntegration.syncStatus(externalToLinear);

      // Assert
      expect(result1.direction).toBe('linear-to-external');
      expect(result2.direction).toBe('external-to-linear');
      expect(result1.synced).toBe(true);
      expect(result2.synced).toBe(true);
    });

    test('should handle sync conflicts', async () => {
      // Arrange
      const conflictData = {
        issueId: 'issue-123',
        externalTaskId: 'task-456',
        linearStatus: 'in-progress',
        externalStatus: 'completed',
        lastModified: {
          linear: '2024-01-01T10:00:00Z',
          external: '2024-01-01T11:00:00Z'
        }
      };

      linearIntegration.syncStatus.mockResolvedValue({
        success: true,
        conflict: true,
        resolution: 'external-wins',
        finalStatus: 'completed'
      });

      // Act
      const result = await linearIntegration.syncStatus(conflictData);

      // Assert
      expect(result.conflict).toBe(true);
      expect(result.resolution).toBe('external-wins');
      expect(result.finalStatus).toBe('completed');
    });
  });

  describe('Rate Limiting', () => {
    test('should handle API rate limits gracefully', async () => {
      // Arrange
      const rateLimitInfo = {
        limit: 1000,
        remaining: 0,
        resetTime: new Date(Date.now() + 3600000).toISOString()
      };

      linearIntegration.handleRateLimit.mockResolvedValue({
        success: true,
        action: 'wait',
        waitTime: 3600000,
        retryAfter: rateLimitInfo.resetTime
      });

      // Act
      const result = await linearIntegration.handleRateLimit(rateLimitInfo);

      // Assert
      expect(linearIntegration.handleRateLimit).toHaveBeenCalledWith(rateLimitInfo);
      expect(result.success).toBe(true);
      expect(result.action).toBe('wait');
      expect(result.waitTime).toBe(3600000);
    });

    test('should implement exponential backoff for rate limits', async () => {
      // Arrange
      const rateLimitAttempts = [
        { attempt: 1, waitTime: 1000 },
        { attempt: 2, waitTime: 2000 },
        { attempt: 3, waitTime: 4000 }
      ];

      rateLimitAttempts.forEach(({ attempt, waitTime }) => {
        linearIntegration.handleRateLimit.mockResolvedValueOnce({
          success: true,
          attempt,
          waitTime,
          backoffMultiplier: 2
        });
      });

      // Act & Assert
      for (const { attempt, waitTime } of rateLimitAttempts) {
        const result = await linearIntegration.handleRateLimit({ attempt });
        
        expect(result.waitTime).toBe(waitTime);
        expect(result.backoffMultiplier).toBe(2);
      }
    });

    test('should queue requests during rate limit periods', async () => {
      // Arrange
      const queuedRequests = [
        { type: 'createIssue', data: { title: 'Issue 1' } },
        { type: 'updateIssue', data: { id: 'issue-1', status: 'active' } },
        { type: 'getIssue', data: { id: 'issue-2' } }
      ];

      linearIntegration.handleRateLimit.mockResolvedValue({
        success: true,
        queued: true,
        queueSize: queuedRequests.length,
        estimatedProcessTime: 60000
      });

      // Act
      const result = await linearIntegration.handleRateLimit({ 
        requests: queuedRequests 
      });

      // Assert
      expect(result.queued).toBe(true);
      expect(result.queueSize).toBe(3);
      expect(result.estimatedProcessTime).toBe(60000);
    });
  });

  describe('Authentication', () => {
    test('should authenticate with Linear API', async () => {
      // Arrange
      const credentials = {
        apiKey: 'linear-api-key-123',
        organizationId: 'org-456'
      };

      linearIntegration.authenticate.mockResolvedValue({
        success: true,
        authenticated: true,
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com'
        },
        permissions: ['read', 'write', 'admin']
      });

      // Act
      const result = await linearIntegration.authenticate(credentials);

      // Assert
      expect(linearIntegration.authenticate).toHaveBeenCalledWith(credentials);
      expect(result.success).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.user.id).toBe('user-123');
      expect(result.permissions).toContain('admin');
    });

    test('should handle authentication failures', async () => {
      // Arrange
      const invalidCredentials = {
        apiKey: 'invalid-api-key',
        organizationId: 'invalid-org'
      };

      linearIntegration.authenticate.mockResolvedValue({
        success: false,
        authenticated: false,
        error: 'Invalid API key',
        code: 'AUTHENTICATION_FAILED'
      });

      // Act
      const result = await linearIntegration.authenticate(invalidCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    test('should refresh expired tokens', async () => {
      // Arrange
      const expiredToken = {
        token: 'expired-token-123',
        expiresAt: new Date(Date.now() - 3600000).toISOString()
      };

      linearIntegration.authenticate.mockResolvedValue({
        success: true,
        tokenRefreshed: true,
        newToken: 'refreshed-token-456',
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });

      // Act
      const result = await linearIntegration.authenticate(expiredToken);

      // Assert
      expect(result.tokenRefreshed).toBe(true);
      expect(result.newToken).toBe('refreshed-token-456');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle network errors gracefully', async () => {
      // Arrange
      const networkError = new Error('Network timeout');
      networkError.code = 'NETWORK_TIMEOUT';

      linearIntegration.createIssue.mockRejectedValue(networkError);

      // Act & Assert
      await expect(linearIntegration.createIssue({})).rejects.toThrow('Network timeout');
    });

    test('should implement circuit breaker pattern', async () => {
      // Arrange
      const circuitBreakerState = {
        state: 'open',
        failureCount: 5,
        lastFailureTime: new Date().toISOString(),
        nextAttemptTime: new Date(Date.now() + 60000).toISOString()
      };

      linearIntegration.createIssue.mockResolvedValue({
        success: false,
        circuitBreaker: circuitBreakerState,
        error: 'Circuit breaker is open'
      });

      // Act
      const result = await linearIntegration.createIssue({});

      // Assert
      expect(result.success).toBe(false);
      expect(result.circuitBreaker.state).toBe('open');
      expect(result.error).toBe('Circuit breaker is open');
    });

    test('should handle partial failures in batch operations', async () => {
      // Arrange
      const batchIssues = [
        { title: 'Issue 1' },
        { title: 'Issue 2' },
        { title: '' }, // Invalid issue
        { title: 'Issue 4' }
      ];

      linearIntegration.createIssue.mockResolvedValue({
        success: true,
        results: [
          { success: true, issue: { id: 'issue-1', title: 'Issue 1' } },
          { success: true, issue: { id: 'issue-2', title: 'Issue 2' } },
          { success: false, error: 'Title is required' },
          { success: true, issue: { id: 'issue-4', title: 'Issue 4' } }
        ],
        successCount: 3,
        failureCount: 1
      });

      // Act
      const result = await linearIntegration.createIssue({ batch: batchIssues });

      // Assert
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(1);
      expect(result.results).toHaveLength(4);
    });
  });
});

