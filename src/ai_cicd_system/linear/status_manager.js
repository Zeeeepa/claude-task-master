/**
 * Status Manager
 * 
 * Manages bidirectional status synchronization between Linear and Task Master,
 * handling conflicts and providing intelligent status mapping.
 */

import { LinearClient } from './linear_client.js';
import { ConflictResolver } from './conflict_resolver.js';
import { readJSON, writeJSON, findTaskById } from '../../../scripts/modules/utils.js';
import setTaskStatus from '../../../scripts/modules/task-manager/set-task-status.js';
import logger from '../../../mcp-server/src/logger.js';
import path from 'path';

export class StatusManager {
  constructor(config = {}) {
    this.config = config;
    this.linearClient = new LinearClient(config.linear || {});
    this.conflictResolver = new ConflictResolver(config.conflictResolution || {});
    
    // Status mappings
    this.statusMappings = config.statusMappings || this.getDefaultStatusMappings();
    this.taskMasterMapping = config.taskMasterIntegration?.statusMapping || this.getDefaultTaskMasterMapping();
    
    // Integration settings
    this.integrationEnabled = config.taskMasterIntegration?.enabled !== false;
    this.syncDirection = config.taskMasterIntegration?.syncDirection || 'bidirectional';
    this.autoSync = config.taskMasterIntegration?.autoSync || {};
    
    // Event tracking
    this.eventHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000;
    
    // Statistics
    this.stats = {
      totalUpdates: 0,
      successfulUpdates: 0,
      conflicts: 0,
      errors: 0
    };
  }

  /**
   * Get default status mappings for CI/CD events
   */
  getDefaultStatusMappings() {
    return {
      'task_created': 'backlog',
      'task_assigned': 'todo',
      'development_started': 'in_progress',
      'pr_created': 'in_review',
      'pr_approved': 'ready_for_merge',
      'deployment_started': 'deploying',
      'deployment_success': 'done',
      'deployment_failed': 'failed',
      'task_blocked': 'blocked',
      'task_cancelled': 'cancelled',
      'build_failed': 'failed',
      'test_failed': 'failed',
      'validation_failed': 'in_progress',
      'manual_review_requested': 'in_review',
      'manual_testing_required': 'testing',
      'manual_hold': 'blocked'
    };
  }

  /**
   * Get default Task Master status mapping
   */
  getDefaultTaskMasterMapping() {
    return {
      'pending': 'backlog',
      'in-progress': 'in_progress',
      'done': 'done',
      'deferred': 'blocked',
      'cancelled': 'cancelled'
    };
  }

  /**
   * Update status from CI/CD event
   */
  async updateStatusFromEvent(issueId, event, metadata = {}) {
    try {
      this.stats.totalUpdates++;
      
      const targetState = this.statusMappings[event];
      if (!targetState) {
        throw new Error(`Unknown event type: ${event}`);
      }

      // Get current issue state
      const issue = await this.linearClient.getIssue(issueId);
      if (!issue) {
        throw new Error(`Issue not found: ${issueId}`);
      }

      // Check for conflicts
      const conflictResult = await this.conflictResolver.checkForConflicts(
        issue, targetState, event, metadata
      );

      let updateResult;
      
      if (conflictResult.hasConflict) {
        this.stats.conflicts++;
        
        // Resolve conflict
        const resolution = await this.conflictResolver.resolveConflict(conflictResult);
        
        if (resolution.action === 'skip') {
          logger.info(`Skipping status update for ${issueId} due to conflict resolution`);
          return {
            success: true,
            skipped: true,
            reason: resolution.reason,
            conflict: conflictResult
          };
        } else if (resolution.action === 'escalate') {
          await this.escalateConflict(conflictResult, resolution);
          return {
            success: true,
            escalated: true,
            conflict: conflictResult
          };
        }
        
        // Apply resolved state
        targetState = resolution.resolvedState || targetState;
      }

      // Get Linear state ID for target state
      const teamStates = await this.linearClient.getTeamStates();
      const linearState = teamStates.find(state => 
        state.name.toLowerCase() === targetState.toLowerCase() ||
        state.type === targetState
      );

      if (!linearState) {
        throw new Error(`Linear state not found for: ${targetState}`);
      }

      // Update Linear issue
      updateResult = await this.linearClient.updateIssueStatus(issueId, linearState.id);
      
      if (!updateResult.success) {
        throw new Error('Failed to update Linear issue status');
      }

      // Sync with Task Master if enabled
      if (this.integrationEnabled && this.syncDirection !== 'linear-only') {
        await this.syncToTaskMaster(issue, targetState, event, metadata);
      }

      // Record event
      this.recordEvent({
        type: 'status_update',
        issueId,
        event,
        fromState: issue.state.name,
        toState: targetState,
        metadata,
        timestamp: new Date(),
        conflict: conflictResult.hasConflict ? conflictResult : null
      });

      this.stats.successfulUpdates++;

      return {
        success: true,
        issueId,
        fromState: issue.state.name,
        toState: targetState,
        event,
        metadata,
        conflict: conflictResult.hasConflict ? conflictResult : null
      };

    } catch (error) {
      this.stats.errors++;
      logger.error(`Error updating status for ${issueId}:`, error);
      
      this.recordEvent({
        type: 'status_update_error',
        issueId,
        event,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Sync status change to Task Master
   */
  async syncToTaskMaster(linearIssue, newLinearState, event, metadata) {
    try {
      // Extract task ID from Linear issue
      const taskId = this.extractTaskIdFromLinearIssue(linearIssue);
      if (!taskId) {
        logger.info(`No task ID found for Linear issue ${linearIssue.id}, skipping Task Master sync`);
        return;
      }

      // Map Linear state to Task Master status
      const taskMasterStatus = this.mapLinearStateToTaskMasterStatus(newLinearState);
      if (!taskMasterStatus) {
        logger.warn(`No Task Master status mapping for Linear state: ${newLinearState}`);
        return;
      }

      // Get current task
      const tasksPath = path.join(process.cwd(), 'tasks.json');
      const tasksData = readJSON(tasksPath);
      const task = findTaskById(tasksData.tasks, taskId);
      
      if (!task) {
        logger.warn(`Task ${taskId} not found in Task Master`);
        return;
      }

      // Check if status change is needed
      if (task.status === taskMasterStatus) {
        logger.info(`Task ${taskId} already has status ${taskMasterStatus}, skipping update`);
        return;
      }

      // Update Task Master status
      await setTaskStatus(tasksPath, taskId, taskMasterStatus, {
        mcpLog: logger.info.bind(logger),
        source: 'linear_sync',
        linearIssueId: linearIssue.id,
        event,
        metadata
      });

      logger.info(`Synced Task Master task ${taskId} status to ${taskMasterStatus} from Linear`);

    } catch (error) {
      logger.error(`Error syncing to Task Master:`, error);
      // Don't throw - this is a secondary operation
    }
  }

  /**
   * Sync Task Master status change to Linear
   */
  async syncFromTaskMaster(taskId, newStatus, metadata = {}) {
    if (!this.integrationEnabled || this.syncDirection === 'linear-only') {
      return;
    }

    try {
      // Find corresponding Linear issue
      const linearIssue = await this.linearClient.getLinearIssueForTask(taskId);
      if (!linearIssue) {
        logger.info(`No Linear issue found for task ${taskId}, skipping sync`);
        return;
      }

      // Map Task Master status to Linear state
      const linearState = this.taskMasterMapping[newStatus];
      if (!linearState) {
        logger.warn(`No Linear state mapping for Task Master status: ${newStatus}`);
        return;
      }

      // Update Linear issue using the event-based system
      await this.updateStatusFromEvent(linearIssue.id, 'task_status_changed', {
        taskId,
        newStatus,
        source: 'task_master',
        ...metadata
      });

      logger.info(`Synced Linear issue ${linearIssue.id} status from Task Master task ${taskId}`);

    } catch (error) {
      logger.error(`Error syncing from Task Master:`, error);
      // Don't throw - this is a secondary operation
    }
  }

  /**
   * Batch update multiple issues
   */
  async batchUpdateStatuses(updates) {
    const results = [];
    
    for (const update of updates) {
      try {
        const result = await this.updateStatusFromEvent(
          update.issueId,
          update.event,
          update.metadata || {}
        );
        results.push({ ...update, result, success: true });
      } catch (error) {
        results.push({ 
          ...update, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * Extract task ID from Linear issue
   */
  extractTaskIdFromLinearIssue(issue) {
    // Try to extract from title (format: "Task 123: Title")
    const titleMatch = issue.title.match(/^Task (\d+(?:\.\d+)*)/);
    if (titleMatch) {
      return titleMatch[1];
    }

    // Try to extract from description (format: "task-master-id:123")
    if (issue.description) {
      const descMatch = issue.description.match(/task-master-id:(\d+(?:\.\d+)*)/);
      if (descMatch) {
        return descMatch[1];
      }
    }

    return null;
  }

  /**
   * Map Linear state to Task Master status
   */
  mapLinearStateToTaskMasterStatus(linearState) {
    const reverseMapping = {};
    for (const [taskStatus, linearStateValue] of Object.entries(this.taskMasterMapping)) {
      reverseMapping[linearStateValue] = taskStatus;
    }
    
    return reverseMapping[linearState] || null;
  }

  /**
   * Escalate conflict for manual resolution
   */
  async escalateConflict(conflictResult, resolution) {
    logger.warn(`Escalating conflict for issue ${conflictResult.issueId}:`, {
      conflict: conflictResult,
      resolution
    });

    // Add comment to Linear issue about the conflict
    try {
      await this.linearClient.addComment(
        conflictResult.issueId,
        `⚠️ **Status Update Conflict Detected**\n\n` +
        `A conflict was detected when trying to update this issue's status:\n\n` +
        `**Proposed Change:** ${conflictResult.proposedChange.event} → ${conflictResult.proposedChange.targetState}\n` +
        `**Conflict:** ${conflictResult.conflicts.map(c => c.description).join(', ')}\n\n` +
        `This conflict has been escalated for manual resolution. Please review and update the status manually if needed.`
      );
    } catch (error) {
      logger.error('Failed to add conflict comment to Linear issue:', error);
    }

    // TODO: Implement additional escalation mechanisms (email, Slack, etc.)
  }

  /**
   * Record event in history
   */
  recordEvent(event) {
    this.eventHistory.push(event);
    
    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 50) {
    return this.eventHistory.slice(-limit).reverse();
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.totalUpdates > 0 
        ? (this.stats.successfulUpdates / this.stats.totalUpdates) * 100 
        : 0,
      conflictRate: this.stats.totalUpdates > 0
        ? (this.stats.conflicts / this.stats.totalUpdates) * 100
        : 0
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const linearHealth = await this.linearClient.healthCheck();
      
      return {
        status: linearHealth.status === 'healthy' ? 'healthy' : 'degraded',
        linear: linearHealth,
        integration: {
          enabled: this.integrationEnabled,
          syncDirection: this.syncDirection,
          autoSync: this.autoSync
        },
        statistics: this.getStatistics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        statistics: this.getStatistics()
      };
    }
  }
}

export default StatusManager;

