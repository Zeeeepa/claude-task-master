/**
 * Linear Conflict Resolver
 * 
 * Handles conflicts between manual ticket updates and automated changes,
 * providing intelligent resolution strategies and escalation mechanisms.
 */

import logger from '../../../mcp-server/src/logger.js';

export class ConflictResolver {
  constructor(config = {}) {
    this.config = config;
    this.resolutionStrategies = config.strategies || this.getDefaultStrategies();
    this.escalationConfig = config.escalation || this.getDefaultEscalationConfig();
    
    // Conflict tracking
    this.conflictHistory = [];
    this.maxHistorySize = config.maxHistorySize || 500;
    
    // Resolution statistics
    this.resolutionStats = {
      total: 0,
      byStrategy: {},
      byType: {},
      escalated: 0
    };
  }

  /**
   * Get default resolution strategies
   */
  getDefaultStrategies() {
    return {
      // Strategy priority order (higher number = higher priority)
      priority: {
        'manual_override': 100,      // Manual changes always win
        'recent_change': 80,         // Most recent change wins
        'automation_skip': 60,       // Skip automation if manual change is recent
        'merge_changes': 40,         // Try to merge compatible changes
        'escalate': 20              // Escalate for manual resolution
      },
      
      // Time-based rules
      timeRules: {
        recentChangeThreshold: 300000,    // 5 minutes
        manualOverrideWindow: 1800000,    // 30 minutes
        automationCooldown: 600000        // 10 minutes
      },
      
      // Field-specific rules
      fieldRules: {
        status: {
          allowAutomation: true,
          manualOverridePriority: true,
          conflictThreshold: 'immediate'
        },
        assignee: {
          allowAutomation: false,  // Never auto-change assignee
          manualOverridePriority: true,
          conflictThreshold: 'never'
        },
        priority: {
          allowAutomation: true,
          manualOverridePriority: false,
          conflictThreshold: 'recent'
        },
        description: {
          allowAutomation: false,
          manualOverridePriority: true,
          conflictThreshold: 'never'
        }
      }
    };
  }

  /**
   * Get default escalation configuration
   */
  getDefaultEscalationConfig() {
    return {
      // Escalation triggers
      triggers: {
        repeatedConflicts: 3,        // Escalate after 3 conflicts on same issue
        highPriorityIssue: true,     // Always escalate for urgent/high priority
        criticalPath: true,          // Escalate for critical path issues
        multipleStakeholders: true   // Escalate when multiple people involved
      },
      
      // Escalation targets
      targets: {
        assignee: true,
        projectLead: true,
        teamLead: false,
        customWebhook: null
      },
      
      // Escalation delays
      delays: {
        immediate: 0,
        quick: 300000,      // 5 minutes
        standard: 1800000,  // 30 minutes
        delayed: 3600000    // 1 hour
      }
    };
  }

  /**
   * Check for conflicts between current state and proposed changes
   */
  async checkForConflicts(issue, targetState, event, metadata = {}) {
    try {
      const conflicts = [];
      const currentTime = new Date();
      
      // Get issue update history (if available)
      const recentUpdates = await this.getRecentUpdates(issue.id);
      
      // Check for recent manual changes
      const recentManualChange = this.findRecentManualChange(recentUpdates, currentTime);
      
      if (recentManualChange) {
        conflicts.push({
          type: 'recent_manual_change',
          description: `Manual change detected ${this.getTimeSince(recentManualChange.timestamp)} ago`,
          severity: this.calculateConflictSeverity(recentManualChange, event),
          manualChange: recentManualChange,
          proposedChange: {
            event,
            targetState,
            metadata
          }
        });
      }

      // Check for field-specific conflicts
      const fieldConflicts = this.checkFieldConflicts(issue, targetState, event, metadata);
      conflicts.push(...fieldConflicts);

      // Check for business rule conflicts
      const businessConflicts = this.checkBusinessRuleConflicts(issue, targetState, event, metadata);
      conflicts.push(...businessConflicts);

      // Check for concurrent automation conflicts
      const automationConflicts = this.checkAutomationConflicts(issue, event, metadata);
      conflicts.push(...automationConflicts);

      const hasConflict = conflicts.length > 0;
      const primaryConflict = hasConflict ? this.selectPrimaryConflict(conflicts) : null;

      const result = {
        hasConflict,
        conflicts,
        primaryConflict,
        issue,
        targetState,
        event,
        metadata,
        timestamp: currentTime.toISOString()
      };

      if (hasConflict) {
        logger.warn('Conflict detected:', {
          issueId: issue.id,
          identifier: issue.identifier,
          event,
          conflictCount: conflicts.length,
          primaryConflict: primaryConflict?.type
        });

        // Record conflict
        this.recordConflict(result);
      }

      return result;

    } catch (error) {
      logger.error('Failed to check for conflicts:', {
        issueId: issue.id,
        event,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resolve conflict using configured strategies
   */
  async resolveConflict(conflictResult) {
    try {
      const { primaryConflict, issue, targetState, event, metadata } = conflictResult;
      
      logger.info('Resolving conflict:', {
        issueId: issue.id,
        conflictType: primaryConflict.type,
        event
      });

      // Determine resolution strategy
      const strategy = this.selectResolutionStrategy(conflictResult);
      
      // Execute resolution strategy
      const resolution = await this.executeResolutionStrategy(strategy, conflictResult);
      
      // Update statistics
      this.updateResolutionStats(strategy, primaryConflict.type, resolution);
      
      // Record resolution
      this.recordResolution(conflictResult, strategy, resolution);

      logger.info('Conflict resolved:', {
        issueId: issue.id,
        strategy: strategy.name,
        action: resolution.action,
        success: resolution.success
      });

      return resolution;

    } catch (error) {
      logger.error('Failed to resolve conflict:', {
        issueId: conflictResult.issue.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check for field-specific conflicts
   */
  checkFieldConflicts(issue, targetState, event, metadata) {
    const conflicts = [];
    const fieldRules = this.resolutionStrategies.fieldRules;

    // Status field conflict
    if (targetState && issue.state.id !== targetState.id) {
      const statusRule = fieldRules.status;
      if (!statusRule.allowAutomation) {
        conflicts.push({
          type: 'field_automation_disabled',
          field: 'status',
          description: 'Automated status changes are disabled',
          severity: 'high'
        });
      }
    }

    // Assignee field conflict
    if (metadata.assigneeChange && fieldRules.assignee.conflictThreshold === 'never') {
      conflicts.push({
        type: 'field_protected',
        field: 'assignee',
        description: 'Assignee field is protected from automation',
        severity: 'medium'
      });
    }

    return conflicts;
  }

  /**
   * Check for business rule conflicts
   */
  checkBusinessRuleConflicts(issue, targetState, event, metadata) {
    const conflicts = [];

    // Check for invalid state transitions
    if (targetState && !this.isValidStateTransition(issue.state, targetState)) {
      conflicts.push({
        type: 'invalid_state_transition',
        description: `Invalid transition from ${issue.state.name} to ${targetState.name}`,
        severity: 'high',
        fromState: issue.state,
        toState: targetState
      });
    }

    // Check for priority conflicts
    if (issue.priority >= 3 && this.escalationConfig.triggers.highPriorityIssue) {
      conflicts.push({
        type: 'high_priority_issue',
        description: 'High priority issue requires manual oversight',
        severity: 'medium',
        priority: issue.priority
      });
    }

    // Check for critical path conflicts
    if (this.isCriticalPath(issue) && this.escalationConfig.triggers.criticalPath) {
      conflicts.push({
        type: 'critical_path_issue',
        description: 'Critical path issue requires careful handling',
        severity: 'high'
      });
    }

    return conflicts;
  }

  /**
   * Check for concurrent automation conflicts
   */
  checkAutomationConflicts(issue, event, metadata) {
    const conflicts = [];
    
    // Check for recent automation on the same issue
    const recentAutomation = this.findRecentAutomation(issue.id);
    
    if (recentAutomation) {
      const timeSince = Date.now() - new Date(recentAutomation.timestamp).getTime();
      const cooldown = this.resolutionStrategies.timeRules.automationCooldown;
      
      if (timeSince < cooldown) {
        conflicts.push({
          type: 'automation_cooldown',
          description: `Recent automation detected, cooldown period active`,
          severity: 'low',
          recentAutomation,
          remainingCooldown: cooldown - timeSince
        });
      }
    }

    return conflicts;
  }

  /**
   * Select primary conflict from multiple conflicts
   */
  selectPrimaryConflict(conflicts) {
    // Sort by severity and return the most severe
    const severityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    
    return conflicts.sort((a, b) => {
      const severityA = severityOrder[a.severity] || 0;
      const severityB = severityOrder[b.severity] || 0;
      return severityB - severityA;
    })[0];
  }

  /**
   * Select resolution strategy based on conflict
   */
  selectResolutionStrategy(conflictResult) {
    const { primaryConflict, issue, event } = conflictResult;
    const strategies = this.resolutionStrategies.priority;

    // Check for manual override conditions
    if (this.shouldManualOverride(conflictResult)) {
      return {
        name: 'manual_override',
        priority: strategies.manual_override,
        action: 'skip',
        reason: 'Manual change takes precedence'
      };
    }

    // Check for recent change conditions
    if (primaryConflict.type === 'recent_manual_change') {
      const timeSince = Date.now() - new Date(primaryConflict.manualChange.timestamp).getTime();
      const threshold = this.resolutionStrategies.timeRules.recentChangeThreshold;
      
      if (timeSince < threshold) {
        return {
          name: 'recent_change',
          priority: strategies.recent_change,
          action: 'skip',
          reason: 'Recent manual change detected'
        };
      }
    }

    // Check for escalation conditions
    if (this.shouldEscalate(conflictResult)) {
      return {
        name: 'escalate',
        priority: strategies.escalate,
        action: 'manual',
        reason: 'Conflict requires manual resolution'
      };
    }

    // Check for merge possibilities
    if (this.canMergeChanges(conflictResult)) {
      return {
        name: 'merge_changes',
        priority: strategies.merge_changes,
        action: 'merge',
        reason: 'Changes can be merged'
      };
    }

    // Default to automation skip
    return {
      name: 'automation_skip',
      priority: strategies.automation_skip,
      action: 'skip',
      reason: 'Skipping automation due to conflict'
    };
  }

  /**
   * Execute resolution strategy
   */
  async executeResolutionStrategy(strategy, conflictResult) {
    const { action, reason } = strategy;
    const { issue, targetState, event, metadata } = conflictResult;

    switch (action) {
      case 'skip':
        return {
          action: 'skip',
          success: true,
          reason: reason,
          strategy: strategy.name
        };

      case 'override':
        return {
          action: 'override',
          success: true,
          reason: reason,
          strategy: strategy.name,
          note: 'Proceeding with automation despite conflict'
        };

      case 'merge':
        const mergeResult = await this.attemptMerge(conflictResult);
        return {
          action: 'merge',
          success: mergeResult.success,
          reason: reason,
          strategy: strategy.name,
          mergeDetails: mergeResult
        };

      case 'manual':
        await this.escalateConflict(conflictResult);
        return {
          action: 'manual',
          success: true,
          reason: reason,
          strategy: strategy.name,
          escalated: true
        };

      default:
        throw new Error(`Unknown resolution action: ${action}`);
    }
  }

  /**
   * Check if manual override should be applied
   */
  shouldManualOverride(conflictResult) {
    const { primaryConflict, issue } = conflictResult;
    
    // Always override for protected fields
    if (primaryConflict.type === 'field_protected') {
      return true;
    }

    // Override for recent manual changes within override window
    if (primaryConflict.type === 'recent_manual_change') {
      const timeSince = Date.now() - new Date(primaryConflict.manualChange.timestamp).getTime();
      const overrideWindow = this.resolutionStrategies.timeRules.manualOverrideWindow;
      return timeSince < overrideWindow;
    }

    return false;
  }

  /**
   * Check if conflict should be escalated
   */
  shouldEscalate(conflictResult) {
    const { issue, primaryConflict } = conflictResult;
    const triggers = this.escalationConfig.triggers;

    // High priority issues
    if (issue.priority >= 3 && triggers.highPriorityIssue) {
      return true;
    }

    // Critical path issues
    if (this.isCriticalPath(issue) && triggers.criticalPath) {
      return true;
    }

    // Repeated conflicts
    const conflictCount = this.getIssueConflictCount(issue.id);
    if (conflictCount >= triggers.repeatedConflicts) {
      return true;
    }

    // High severity conflicts
    if (primaryConflict.severity === 'high') {
      return true;
    }

    return false;
  }

  /**
   * Check if changes can be merged
   */
  canMergeChanges(conflictResult) {
    const { primaryConflict, targetState, metadata } = conflictResult;

    // Can't merge if it's a field protection conflict
    if (primaryConflict.type === 'field_protected') {
      return false;
    }

    // Can't merge invalid state transitions
    if (primaryConflict.type === 'invalid_state_transition') {
      return false;
    }

    // Simple conflicts might be mergeable
    if (primaryConflict.type === 'automation_cooldown' && primaryConflict.severity === 'low') {
      return true;
    }

    return false;
  }

  /**
   * Attempt to merge changes
   */
  async attemptMerge(conflictResult) {
    const { primaryConflict, issue, targetState, metadata } = conflictResult;

    try {
      // For automation cooldown conflicts, just add a delay
      if (primaryConflict.type === 'automation_cooldown') {
        const delay = primaryConflict.remainingCooldown;
        
        return {
          success: true,
          action: 'delayed_execution',
          delay: delay,
          note: `Automation delayed by ${Math.round(delay / 1000)} seconds`
        };
      }

      // Add more merge strategies as needed
      return {
        success: false,
        reason: 'No merge strategy available for this conflict type'
      };

    } catch (error) {
      logger.error('Failed to merge changes:', {
        issueId: issue.id,
        conflictType: primaryConflict.type,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Escalate conflict for manual resolution
   */
  async escalateConflict(conflictResult) {
    const { issue, primaryConflict, event } = conflictResult;
    const targets = this.escalationConfig.targets;

    logger.info('Escalating conflict:', {
      issueId: issue.id,
      conflictType: primaryConflict.type,
      event
    });

    // Create escalation notification
    const escalationData = {
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      conflict: primaryConflict,
      event: event,
      timestamp: new Date().toISOString(),
      urgency: this.calculateEscalationUrgency(conflictResult)
    };

    // Notify assignee
    if (targets.assignee && issue.assignee) {
      await this.notifyAssignee(escalationData);
    }

    // Notify project lead
    if (targets.projectLead && issue.project) {
      await this.notifyProjectLead(escalationData);
    }

    // Custom webhook notification
    if (targets.customWebhook) {
      await this.sendWebhookNotification(escalationData);
    }

    // Update escalation statistics
    this.resolutionStats.escalated++;
  }

  /**
   * Helper methods
   */
  async getRecentUpdates(issueId) {
    // This would fetch recent updates from Linear API or cache
    // For now, return empty array
    return [];
  }

  findRecentManualChange(updates, currentTime) {
    const threshold = this.resolutionStrategies.timeRules.recentChangeThreshold;
    
    return updates.find(update => {
      const timeSince = currentTime.getTime() - new Date(update.timestamp).getTime();
      return timeSince < threshold && update.source === 'manual';
    });
  }

  findRecentAutomation(issueId) {
    // Check conflict history for recent automation
    const recentConflicts = this.conflictHistory.filter(conflict => 
      conflict.issue.id === issueId &&
      Date.now() - new Date(conflict.timestamp).getTime() < this.resolutionStrategies.timeRules.automationCooldown
    );

    return recentConflicts.length > 0 ? recentConflicts[0] : null;
  }

  isValidStateTransition(fromState, toState) {
    // Define valid state transitions
    const validTransitions = {
      'backlog': ['todo', 'in_progress', 'cancelled'],
      'todo': ['in_progress', 'blocked', 'cancelled'],
      'in_progress': ['in_review', 'blocked', 'done', 'cancelled'],
      'in_review': ['in_progress', 'done', 'cancelled'],
      'done': ['in_progress'], // Allow reopening
      'blocked': ['in_progress', 'todo', 'cancelled'],
      'cancelled': ['todo', 'in_progress'] // Allow reactivation
    };

    const allowed = validTransitions[fromState.type] || [];
    return allowed.includes(toState.type);
  }

  isCriticalPath(issue) {
    // Check if issue is on critical path
    return issue.labels?.some(label => label.name === 'critical-path') ||
           issue.description?.includes('[critical-path]');
  }

  getIssueConflictCount(issueId) {
    return this.conflictHistory.filter(conflict => conflict.issue.id === issueId).length;
  }

  calculateConflictSeverity(manualChange, event) {
    // Calculate severity based on change type and timing
    if (manualChange.field === 'status' && event.includes('status')) {
      return 'high';
    }
    
    const timeSince = Date.now() - new Date(manualChange.timestamp).getTime();
    if (timeSince < 300000) { // 5 minutes
      return 'high';
    } else if (timeSince < 1800000) { // 30 minutes
      return 'medium';
    } else {
      return 'low';
    }
  }

  calculateEscalationUrgency(conflictResult) {
    const { issue, primaryConflict } = conflictResult;
    
    if (issue.priority >= 4) return 'urgent';
    if (primaryConflict.severity === 'high') return 'high';
    if (issue.priority >= 3) return 'medium';
    return 'low';
  }

  getTimeSince(timestamp) {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  }

  recordConflict(conflictResult) {
    this.conflictHistory.push(conflictResult);
    
    // Maintain history size limit
    if (this.conflictHistory.length > this.maxHistorySize) {
      this.conflictHistory.shift();
    }
  }

  recordResolution(conflictResult, strategy, resolution) {
    // Update resolution statistics
    this.resolutionStats.total++;
    this.resolutionStats.byStrategy[strategy.name] = (this.resolutionStats.byStrategy[strategy.name] || 0) + 1;
    this.resolutionStats.byType[conflictResult.primaryConflict.type] = (this.resolutionStats.byType[conflictResult.primaryConflict.type] || 0) + 1;
  }

  updateResolutionStats(strategy, conflictType, resolution) {
    // Already handled in recordResolution
  }

  async notifyAssignee(escalationData) {
    // Implement assignee notification
    logger.info('Notifying assignee of conflict escalation:', {
      issueId: escalationData.issueId,
      assignee: escalationData.assignee
    });
  }

  async notifyProjectLead(escalationData) {
    // Implement project lead notification
    logger.info('Notifying project lead of conflict escalation:', {
      issueId: escalationData.issueId,
      project: escalationData.project
    });
  }

  async sendWebhookNotification(escalationData) {
    // Implement webhook notification
    logger.info('Sending webhook notification for conflict escalation:', {
      issueId: escalationData.issueId,
      webhook: this.escalationConfig.targets.customWebhook
    });
  }

  /**
   * Get conflict resolution statistics
   */
  getStatistics() {
    return {
      ...this.resolutionStats,
      recentConflicts: this.conflictHistory.slice(-10),
      conflictRate: this.conflictHistory.length / Math.max(this.resolutionStats.total, 1)
    };
  }

  /**
   * Clear conflict history
   */
  clearHistory() {
    this.conflictHistory = [];
    logger.info('Conflict history cleared');
  }
}

export default ConflictResolver;

