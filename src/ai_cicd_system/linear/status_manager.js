/**
 * Linear Status Manager
 * 
 * Manages automated ticket status updates based on CI/CD workflow progress.
 * Provides intelligent status transitions and conflict resolution.
 */

import LinearClient from './linear_client.js';
import { ConflictResolver } from './conflict_resolver.js';
import logger from '../../../mcp-server/src/logger.js';

export class StatusManager {
  constructor(config = {}) {
    this.linearClient = new LinearClient(config.linear);
    this.conflictResolver = new ConflictResolver(config.conflictResolution);
    
    // Status mapping configuration
    this.statusMappings = config.statusMappings || this.getDefaultStatusMappings();
    
    // Workflow state cache
    this.stateCache = new Map();
    this.cacheExpiry = config.cacheExpiry || 300000; // 5 minutes
    
    // Event tracking
    this.eventHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000;
  }

  /**
   * Get default status mappings for CI/CD workflow events
   */
  getDefaultStatusMappings() {
    return {
      // CI/CD Events -> Linear State Types
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
      
      // Error states
      'build_failed': 'failed',
      'test_failed': 'failed',
      'validation_failed': 'in_progress', // Return to development
      
      // Manual overrides
      'manual_review_requested': 'in_review',
      'manual_testing_required': 'testing',
      'manual_hold': 'blocked'
    };
  }

  /**
   * Update issue status based on workflow event
   */
  async updateStatusFromEvent(issueId, event, metadata = {}) {
    try {
      logger.info('Processing status update event:', { issueId, event, metadata });

      // Get current issue state
      const issue = await this.linearClient.getIssue(issueId);
      if (!issue) {
        throw new Error(`Issue not found: ${issueId}`);
      }

      // Determine target status
      const targetStateType = this.statusMappings[event];
      if (!targetStateType) {
        logger.warn('No status mapping found for event:', { event, issueId });
        return { success: false, reason: 'No status mapping found' };
      }

      // Get team states
      const teamStates = await this.getTeamStates(issue.team.id);
      const targetState = teamStates.find(state => state.type === targetStateType);
      
      if (!targetState) {
        throw new Error(`Target state type not found: ${targetStateType}`);
      }

      // Check for conflicts
      const conflictResult = await this.conflictResolver.checkForConflicts(
        issue,
        targetState,
        event,
        metadata
      );

      if (conflictResult.hasConflict) {
        logger.warn('Status update conflict detected:', {
          issueId,
          event,
          conflict: conflictResult.conflict
        });

        // Handle conflict based on resolution strategy
        const resolution = await this.conflictResolver.resolveConflict(conflictResult);
        
        if (resolution.action === 'skip') {
          return {
            success: false,
            reason: 'Conflict resolution: skip update',
            conflict: conflictResult.conflict
          };
        } else if (resolution.action === 'override') {
          // Continue with update
          logger.info('Conflict resolved: proceeding with override');
        } else if (resolution.action === 'manual') {
          // Escalate for manual resolution
          await this.escalateForManualResolution(issue, targetState, conflictResult);
          return {
            success: false,
            reason: 'Escalated for manual resolution',
            conflict: conflictResult.conflict
          };
        }
      }

      // Validate state transition
      const transitionValid = await this.validateStateTransition(
        issue.state,
        targetState,
        event
      );

      if (!transitionValid.valid) {
        logger.warn('Invalid state transition:', {
          issueId,
          from: issue.state.name,
          to: targetState.name,
          reason: transitionValid.reason
        });
        
        return {
          success: false,
          reason: `Invalid transition: ${transitionValid.reason}`
        };
      }

      // Perform status update
      const updatedIssue = await this.linearClient.updateIssueStatus(
        issueId,
        targetState.id
      );

      // Add status change comment
      await this.addStatusChangeComment(
        issueId,
        issue.state,
        targetState,
        event,
        metadata
      );

      // Record event
      this.recordEvent({
        issueId,
        event,
        fromState: issue.state,
        toState: targetState,
        metadata,
        timestamp: new Date().toISOString(),
        success: true
      });

      logger.info('Status updated successfully:', {
        issueId,
        identifier: issue.identifier,
        from: issue.state.name,
        to: targetState.name,
        event
      });

      return {
        success: true,
        issue: updatedIssue,
        transition: {
          from: issue.state,
          to: targetState,
          event
        }
      };

    } catch (error) {
      logger.error('Failed to update status from event:', {
        issueId,
        event,
        error: error.message
      });

      // Record failed event
      this.recordEvent({
        issueId,
        event,
        metadata,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Batch update statuses for multiple issues
   */
  async batchUpdateStatuses(updates) {
    const results = [];
    
    // Group updates by team to optimize state fetching
    const updatesByTeam = new Map();
    
    for (const update of updates) {
      const { issueId, event, metadata } = update;
      
      try {
        // Get issue to determine team
        const issue = await this.linearClient.getIssue(issueId);
        if (!issue) {
          results.push({
            issueId,
            success: false,
            reason: 'Issue not found'
          });
          continue;
        }

        const teamId = issue.team.id;
        if (!updatesByTeam.has(teamId)) {
          updatesByTeam.set(teamId, []);
        }
        
        updatesByTeam.get(teamId).push({
          ...update,
          issue
        });
      } catch (error) {
        results.push({
          issueId,
          success: false,
          error: error.message
        });
      }
    }

    // Process updates by team
    for (const [teamId, teamUpdates] of updatesByTeam) {
      try {
        // Pre-fetch team states
        const teamStates = await this.getTeamStates(teamId);
        
        // Process team updates in parallel (with concurrency limit)
        const concurrencyLimit = 5;
        for (let i = 0; i < teamUpdates.length; i += concurrencyLimit) {
          const batch = teamUpdates.slice(i, i + concurrencyLimit);
          
          const batchPromises = batch.map(async (update) => {
            try {
              const result = await this.updateStatusFromEvent(
                update.issueId,
                update.event,
                update.metadata
              );
              return { issueId: update.issueId, ...result };
            } catch (error) {
              return {
                issueId: update.issueId,
                success: false,
                error: error.message
              };
            }
          });

          const batchResults = await Promise.all(batchPromises);
          results.push(...batchResults);
        }
      } catch (error) {
        logger.error('Failed to process team updates:', { teamId, error: error.message });
        
        // Mark all team updates as failed
        teamUpdates.forEach(update => {
          results.push({
            issueId: update.issueId,
            success: false,
            error: `Team processing failed: ${error.message}`
          });
        });
      }
    }

    return results;
  }

  /**
   * Get team states with caching
   */
  async getTeamStates(teamId) {
    const cacheKey = `team_states_${teamId}`;
    const cached = this.stateCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.states;
    }

    const states = await this.linearClient.getTeamStates(teamId);
    
    this.stateCache.set(cacheKey, {
      states,
      timestamp: Date.now()
    });

    return states;
  }

  /**
   * Validate state transition
   */
  async validateStateTransition(fromState, toState, event) {
    // Define valid transition rules
    const transitionRules = {
      'backlog': ['todo', 'in_progress', 'cancelled'],
      'todo': ['in_progress', 'blocked', 'cancelled'],
      'in_progress': ['in_review', 'blocked', 'done', 'cancelled'],
      'in_review': ['in_progress', 'ready_for_merge', 'done', 'cancelled'],
      'ready_for_merge': ['deploying', 'done', 'in_progress'],
      'deploying': ['done', 'failed'],
      'done': ['in_progress'], // Allow reopening
      'failed': ['in_progress', 'cancelled'],
      'blocked': ['in_progress', 'todo', 'cancelled'],
      'cancelled': ['todo', 'in_progress'] // Allow reactivation
    };

    const validTransitions = transitionRules[fromState.type] || [];
    
    if (!validTransitions.includes(toState.type)) {
      return {
        valid: false,
        reason: `Transition from ${fromState.type} to ${toState.type} not allowed`
      };
    }

    // Additional event-specific validations
    if (event === 'deployment_success' && fromState.type !== 'deploying') {
      return {
        valid: false,
        reason: 'Deployment success can only occur from deploying state'
      };
    }

    if (event === 'pr_created' && fromState.type === 'done') {
      return {
        valid: false,
        reason: 'Cannot create PR for completed task'
      };
    }

    return { valid: true };
  }

  /**
   * Add status change comment
   */
  async addStatusChangeComment(issueId, fromState, toState, event, metadata) {
    const comment = this.generateStatusChangeComment(fromState, toState, event, metadata);
    
    try {
      await this.linearClient.addComment(issueId, comment);
    } catch (error) {
      logger.error('Failed to add status change comment:', {
        issueId,
        error: error.message
      });
      // Don't throw - comment failure shouldn't fail the status update
    }
  }

  /**
   * Generate status change comment
   */
  generateStatusChangeComment(fromState, toState, event, metadata) {
    const timestamp = new Date().toISOString();
    let comment = `🔄 **Status Updated**: ${fromState.name} → ${toState.name}\n`;
    comment += `📅 **Event**: ${event}\n`;
    comment += `⏰ **Time**: ${timestamp}\n`;

    if (metadata.prUrl) {
      comment += `🔗 **PR**: ${metadata.prUrl}\n`;
    }

    if (metadata.commitSha) {
      comment += `📝 **Commit**: ${metadata.commitSha.substring(0, 8)}\n`;
    }

    if (metadata.deploymentUrl) {
      comment += `🚀 **Deployment**: ${metadata.deploymentUrl}\n`;
    }

    if (metadata.reason) {
      comment += `💭 **Reason**: ${metadata.reason}\n`;
    }

    comment += '\n*Automated status update by AI CI/CD System*';

    return comment;
  }

  /**
   * Escalate for manual resolution
   */
  async escalateForManualResolution(issue, targetState, conflictResult) {
    const escalationComment = `⚠️ **Manual Resolution Required**\n\n` +
      `A status update conflict was detected and requires manual intervention:\n\n` +
      `**Conflict**: ${conflictResult.conflict.description}\n` +
      `**Current State**: ${issue.state.name}\n` +
      `**Proposed State**: ${targetState.name}\n` +
      `**Event**: ${conflictResult.event}\n\n` +
      `Please review and manually update the status as appropriate.\n\n` +
      `*Automated escalation by AI CI/CD System*`;

    try {
      await this.linearClient.addComment(issue.id, escalationComment);
      
      // Optionally notify assignee or team
      // This could be extended to send Slack notifications, emails, etc.
      
    } catch (error) {
      logger.error('Failed to escalate for manual resolution:', {
        issueId: issue.id,
        error: error.message
      });
    }
  }

  /**
   * Record event in history
   */
  recordEvent(event) {
    this.eventHistory.push(event);
    
    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event history for an issue
   */
  getIssueEventHistory(issueId) {
    return this.eventHistory.filter(event => event.issueId === issueId);
  }

  /**
   * Get status update statistics
   */
  getStatistics(timeRange = '24h') {
    const cutoff = new Date();
    
    switch (timeRange) {
      case '1h':
        cutoff.setHours(cutoff.getHours() - 1);
        break;
      case '24h':
        cutoff.setDate(cutoff.getDate() - 1);
        break;
      case '7d':
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      default:
        cutoff.setDate(cutoff.getDate() - 1);
    }

    const recentEvents = this.eventHistory.filter(
      event => new Date(event.timestamp) > cutoff
    );

    const stats = {
      totalUpdates: recentEvents.length,
      successfulUpdates: recentEvents.filter(e => e.success).length,
      failedUpdates: recentEvents.filter(e => !e.success).length,
      eventBreakdown: {},
      stateTransitions: {}
    };

    // Event breakdown
    recentEvents.forEach(event => {
      stats.eventBreakdown[event.event] = (stats.eventBreakdown[event.event] || 0) + 1;
    });

    // State transition breakdown
    recentEvents.forEach(event => {
      if (event.fromState && event.toState) {
        const transition = `${event.fromState.name} → ${event.toState.name}`;
        stats.stateTransitions[transition] = (stats.stateTransitions[transition] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * Clear state cache
   */
  clearCache() {
    this.stateCache.clear();
    logger.info('Status manager cache cleared');
  }
}

export default StatusManager;

