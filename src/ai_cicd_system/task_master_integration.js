/**
 * Task Master Integration
 * 
 * Provides hooks and utilities to integrate the AI CI/CD system with
 * the existing Task Master functionality.
 */

import { StatusManager } from './linear/status_manager.js';
import { readJSON } from '../../scripts/modules/utils.js';
import logger from '../../mcp-server/src/logger.js';
import path from 'path';

export class TaskMasterIntegration {
  constructor(config = {}) {
    this.config = config;
    this.statusManager = null;
    this.enabled = config.enabled !== false;
    
    if (this.enabled) {
      this.initializeStatusManager();
    }
  }

  /**
   * Initialize the status manager
   */
  async initializeStatusManager() {
    try {
      // Load Linear configuration
      const configPath = path.join(process.cwd(), 'config', 'linear_config.json');
      const linearConfig = readJSON(configPath);
      
      this.statusManager = new StatusManager(linearConfig);
      logger.info('Task Master integration initialized with Linear status manager');
    } catch (error) {
      logger.warn('Failed to initialize Linear integration:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Hook for task status changes
   * Call this from the existing set-task-status.js module
   */
  async onTaskStatusChange(taskId, oldStatus, newStatus, metadata = {}) {
    if (!this.enabled || !this.statusManager) {
      return;
    }

    try {
      await this.statusManager.syncFromTaskMaster(taskId, newStatus, {
        oldStatus,
        source: 'task_master',
        timestamp: new Date().toISOString(),
        ...metadata
      });
      
      logger.info(`Synced task ${taskId} status change: ${oldStatus} → ${newStatus}`);
    } catch (error) {
      logger.error(`Failed to sync task ${taskId} status change:`, error);
      // Don't throw - this is a secondary operation
    }
  }

  /**
   * Hook for task creation
   * Call this from the existing add-task.js module
   */
  async onTaskCreated(task, metadata = {}) {
    if (!this.enabled || !this.statusManager) {
      return;
    }

    try {
      // Optionally create Linear issue for new tasks
      if (this.config.autoCreateLinearIssues) {
        const linearClient = this.statusManager.linearClient;
        const result = await linearClient.createIssueFromTask(task, {
          teamId: this.config.defaultTeamId,
          additionalFields: metadata.linearFields || {}
        });
        
        if (result.success) {
          logger.info(`Created Linear issue ${result.issue.identifier} for task ${task.id}`);
          return result.issue;
        }
      }
    } catch (error) {
      logger.error(`Failed to create Linear issue for task ${task.id}:`, error);
      // Don't throw - this is a secondary operation
    }
  }

  /**
   * Hook for task updates
   * Call this from the existing update-task-by-id.js module
   */
  async onTaskUpdated(taskId, updates, metadata = {}) {
    if (!this.enabled || !this.statusManager) {
      return;
    }

    try {
      // If status was updated, sync to Linear
      if (updates.status) {
        await this.onTaskStatusChange(taskId, metadata.oldStatus, updates.status, metadata);
      }
      
      // Sync other relevant updates to Linear if needed
      if (this.config.syncTaskUpdates) {
        await this.syncTaskUpdatesToLinear(taskId, updates, metadata);
      }
    } catch (error) {
      logger.error(`Failed to sync task ${taskId} updates:`, error);
      // Don't throw - this is a secondary operation
    }
  }

  /**
   * Sync task updates to Linear
   */
  async syncTaskUpdatesToLinear(taskId, updates, metadata = {}) {
    try {
      const linearClient = this.statusManager.linearClient;
      const linearIssue = await linearClient.getLinearIssueForTask(taskId);
      
      if (!linearIssue) {
        logger.info(`No Linear issue found for task ${taskId}, skipping update sync`);
        return;
      }

      const linearUpdates = {};
      
      // Map task updates to Linear fields
      if (updates.title) {
        linearUpdates.title = `Task ${taskId}: ${updates.title}`;
      }
      
      if (updates.description) {
        linearUpdates.description = `${updates.description}\n\n---\ntask-master-id:${taskId}`;
      }
      
      if (updates.priority) {
        linearUpdates.priority = linearClient.mapTaskPriorityToLinear(updates.priority);
      }

      if (Object.keys(linearUpdates).length > 0) {
        await linearClient.updateIssue(linearIssue.id, linearUpdates);
        logger.info(`Synced task ${taskId} updates to Linear issue ${linearIssue.identifier}`);
      }
    } catch (error) {
      logger.error(`Failed to sync task updates to Linear:`, error);
    }
  }

  /**
   * Get integration status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      statusManager: !!this.statusManager,
      config: {
        autoCreateLinearIssues: this.config.autoCreateLinearIssues || false,
        syncTaskUpdates: this.config.syncTaskUpdates || false,
        defaultTeamId: this.config.defaultTeamId || null
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.enabled) {
      return {
        status: 'disabled',
        message: 'Task Master integration is disabled'
      };
    }

    if (!this.statusManager) {
      return {
        status: 'error',
        message: 'Status manager not initialized'
      };
    }

    try {
      const statusManagerHealth = await this.statusManager.healthCheck();
      return {
        status: statusManagerHealth.status,
        message: 'Task Master integration is operational',
        details: statusManagerHealth
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Health check failed: ${error.message}`
      };
    }
  }
}

// Singleton instance for global use
let integrationInstance = null;

/**
 * Get or create the integration instance
 */
export function getTaskMasterIntegration(config = {}) {
  if (!integrationInstance) {
    integrationInstance = new TaskMasterIntegration(config);
  }
  return integrationInstance;
}

/**
 * Initialize integration with configuration
 */
export function initializeIntegration(config = {}) {
  integrationInstance = new TaskMasterIntegration(config);
  return integrationInstance;
}

/**
 * Convenience hooks for existing Task Master modules
 */
export const hooks = {
  /**
   * Call this from set-task-status.js after status update
   */
  async taskStatusChanged(taskId, oldStatus, newStatus, metadata = {}) {
    const integration = getTaskMasterIntegration();
    await integration.onTaskStatusChange(taskId, oldStatus, newStatus, metadata);
  },

  /**
   * Call this from add-task.js after task creation
   */
  async taskCreated(task, metadata = {}) {
    const integration = getTaskMasterIntegration();
    return await integration.onTaskCreated(task, metadata);
  },

  /**
   * Call this from update-task-by-id.js after task update
   */
  async taskUpdated(taskId, updates, metadata = {}) {
    const integration = getTaskMasterIntegration();
    await integration.onTaskUpdated(taskId, updates, metadata);
  }
};

export default TaskMasterIntegration;

