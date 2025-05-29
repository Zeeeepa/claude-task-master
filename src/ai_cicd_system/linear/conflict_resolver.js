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

      // Check for state transition validity
      const transitionConflict = this.checkStateTransition(issue.state, targetState, event);
      if (transitionConflict) {
        conflicts.push(transitionConflict);
      }

      // Check for repeated conflicts on this issue
      const repeatedConflict = this.checkRepeatedConflicts(issue.id);
      if (repeatedConflict) {
        conflicts.push(repeatedConflict);
      }

      return {
        hasConflict: conflicts.length > 0,
        conflicts,
        issueId: issue.id,
        currentState: issue.state,
        proposedState: targetState,
        event,
        metadata,
        timestamp: currentTime
      };

    } catch (error) {
      logger.error('Error checking for conflicts:', error);
      return {
        hasConflict: false,
        conflicts: [],
        error: error.message
      };
    }
  }

  /**
   * Resolve a conflict using configured strategies
   */
  async resolveConflict(conflictResult) {
    try {
      this.resolutionStats.total++;
      
      // Determine resolution strategy
      const strategy = this.determineResolutionStrategy(conflictResult);
      
      // Track strategy usage
      this.resolutionStats.byStrategy[strategy] = 
        (this.resolutionStats.byStrategy[strategy] || 0) + 1;

      // Apply resolution strategy
      let resolution;
      
      switch (strategy) {
        case 'manual_override':
          resolution = this.applyManualOverride(conflictResult);
          break;
          
        case 'recent_change':
          resolution = this.applyRecentChange(conflictResult);
          break;
          
        case 'automation_skip':
          resolution = this.applyAutomationSkip(conflictResult);
          break;
          
        case 'merge_changes':
          resolution = this.applyMergeChanges(conflictResult);
          break;
          
        case 'escalate':
        default:
          resolution = this.applyEscalation(conflictResult);
          this.resolutionStats.escalated++;
          break;
      }

      // Record conflict resolution
      this.recordConflictResolution(conflictResult, strategy, resolution);

      return {
        strategy,
        action: resolution.action,
        reason: resolution.reason,
        resolvedState: resolution.resolvedState,
        metadata: resolution.metadata
      };

    } catch (error) {
      logger.error('Error resolving conflict:', error);
      return {
        strategy: 'escalate',
        action: 'escalate',
        reason: `Error during resolution: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Determine the best resolution strategy for a conflict
   */
  determineResolutionStrategy(conflictResult) {
    const { conflicts, issueId, event, metadata } = conflictResult;
    
    // Check for escalation triggers first
    if (this.shouldEscalate(conflictResult)) {
      return 'escalate';
    }

    // Find highest priority applicable strategy
    let bestStrategy = 'escalate';
    let highestPriority = 0;

    for (const [strategy, priority] of Object.entries(this.resolutionStrategies.priority)) {
      if (priority > highestPriority && this.isStrategyApplicable(strategy, conflictResult)) {
        bestStrategy = strategy;
        highestPriority = priority;
      }
    }

    return bestStrategy;
  }

  /**
   * Check if a resolution strategy is applicable
   */
  isStrategyApplicable(strategy, conflictResult) {
    const { conflicts, event, metadata } = conflictResult;

    switch (strategy) {
      case 'manual_override':
        return conflicts.some(c => c.type === 'recent_manual_change');
        
      case 'recent_change':
        return conflicts.some(c => c.type === 'recent_manual_change' && 
          this.isWithinTimeThreshold(c.manualChange.timestamp, 'recentChangeThreshold'));
        
      case 'automation_skip':
        return conflicts.some(c => c.type === 'recent_manual_change');
        
      case 'merge_changes':
        return conflicts.every(c => c.severity === 'low');
        
      case 'escalate':
        return true; // Always applicable as fallback
        
      default:
        return false;
    }
  }

  /**
   * Apply manual override resolution
   */
  applyManualOverride(conflictResult) {
    const manualChange = conflictResult.conflicts.find(c => c.type === 'recent_manual_change');
    
    return {
      action: 'skip',
      reason: 'Manual override: Recent manual change takes precedence',
      resolvedState: manualChange?.manualChange.toState,
      metadata: {
        manualChangeTimestamp: manualChange?.manualChange.timestamp,
        originalEvent: conflictResult.event
      }
    };
  }

  /**
   * Apply recent change resolution
   */
  applyRecentChange(conflictResult) {
    const recentChange = conflictResult.conflicts
      .filter(c => c.type === 'recent_manual_change')
      .sort((a, b) => new Date(b.manualChange.timestamp) - new Date(a.manualChange.timestamp))[0];

    return {
      action: 'update',
      reason: 'Recent change wins: Using most recent manual change',
      resolvedState: recentChange.manualChange.toState,
      metadata: {
        recentChangeTimestamp: recentChange.manualChange.timestamp
      }
    };
  }

  /**
   * Apply automation skip resolution
   */
  applyAutomationSkip(conflictResult) {
    return {
      action: 'skip',
      reason: 'Automation skipped due to recent manual changes',
      resolvedState: conflictResult.currentState.name,
      metadata: {
        skippedEvent: conflictResult.event,
        conflictCount: conflictResult.conflicts.length
      }
    };
  }

  /**
   * Apply merge changes resolution
   */
  applyMergeChanges(conflictResult) {
    // For now, prefer the proposed automated change for low-severity conflicts
    return {
      action: 'update',
      reason: 'Merged changes: Low-severity conflicts resolved in favor of automation',
      resolvedState: conflictResult.proposedState,
      metadata: {
        mergedConflicts: conflictResult.conflicts.map(c => c.type)
      }
    };
  }

  /**
   * Apply escalation resolution
   */
  applyEscalation(conflictResult) {
    return {
      action: 'escalate',
      reason: 'Conflict escalated for manual resolution',
      resolvedState: conflictResult.currentState.name,
      metadata: {
        escalationTriggers: this.getEscalationTriggers(conflictResult),
        conflictSummary: conflictResult.conflicts.map(c => ({
          type: c.type,
          severity: c.severity,
          description: c.description
        }))
      }
    };
  }

  /**
   * Check if conflict should be escalated
   */
  shouldEscalate(conflictResult) {
    const { conflicts, issueId, metadata } = conflictResult;
    const triggers = this.escalationConfig.triggers;

    // Check for repeated conflicts
    if (triggers.repeatedConflicts && 
        this.getConflictCount(issueId) >= triggers.repeatedConflicts) {
      return true;
    }

    // Check for high priority issues
    if (triggers.highPriorityIssue && metadata.priority >= 3) {
      return true;
    }

    // Check for critical path issues
    if (triggers.criticalPath && metadata.criticalPath) {
      return true;
    }

    // Check for multiple stakeholders
    if (triggers.multipleStakeholders && metadata.stakeholderCount > 1) {
      return true;
    }

    // Check for high severity conflicts
    if (conflicts.some(c => c.severity === 'high')) {
      return true;
    }

    return false;
  }

  /**
   * Get recent updates for an issue (mock implementation)
   */
  async getRecentUpdates(issueId) {
    // In a real implementation, this would fetch from Linear API or database
    // For now, return empty array
    return [];
  }

  /**
   * Find recent manual changes
   */
  findRecentManualChange(updates, currentTime) {
    const threshold = this.resolutionStrategies.timeRules.recentChangeThreshold;
    
    return updates.find(update => 
      update.type === 'manual' && 
      (currentTime - new Date(update.timestamp)) < threshold
    );
  }

  /**
   * Check field-specific conflicts
   */
  checkFieldConflicts(issue, targetState, event, metadata) {
    const conflicts = [];
    const fieldRules = this.resolutionStrategies.fieldRules;

    // Check status field
    if (fieldRules.status && !fieldRules.status.allowAutomation) {
      conflicts.push({
        type: 'field_protection',
        field: 'status',
        description: 'Status field is protected from automation',
        severity: 'high'
      });
    }

    return conflicts;
  }

  /**
   * Check state transition validity
   */
  checkStateTransition(currentState, targetState, event) {
    // Define invalid transitions
    const invalidTransitions = {
      'done': ['backlog', 'todo'], // Can't go back to early states from done
      'cancelled': ['in_progress', 'in_review'] // Can't resume work on cancelled items
    };

    const invalid = invalidTransitions[currentState.name];
    if (invalid && invalid.includes(targetState)) {
      return {
        type: 'invalid_transition',
        description: `Invalid state transition from ${currentState.name} to ${targetState}`,
        severity: 'medium',
        currentState: currentState.name,
        targetState
      };
    }

    return null;
  }

  /**
   * Check for repeated conflicts on an issue
   */
  checkRepeatedConflicts(issueId) {
    const recentConflicts = this.conflictHistory
      .filter(c => c.issueId === issueId)
      .filter(c => (Date.now() - new Date(c.timestamp)) < 86400000); // Last 24 hours

    if (recentConflicts.length >= this.escalationConfig.triggers.repeatedConflicts) {
      return {
        type: 'repeated_conflicts',
        description: `${recentConflicts.length} conflicts in the last 24 hours`,
        severity: 'high',
        conflictCount: recentConflicts.length
      };
    }

    return null;
  }

  /**
   * Calculate conflict severity
   */
  calculateConflictSeverity(manualChange, event) {
    // High severity for recent manual changes
    if (this.isWithinTimeThreshold(manualChange.timestamp, 'recentChangeThreshold')) {
      return 'high';
    }
    
    // Medium severity for changes within manual override window
    if (this.isWithinTimeThreshold(manualChange.timestamp, 'manualOverrideWindow')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Check if timestamp is within a configured threshold
   */
  isWithinTimeThreshold(timestamp, thresholdKey) {
    const threshold = this.resolutionStrategies.timeRules[thresholdKey];
    return (Date.now() - new Date(timestamp)) < threshold;
  }

  /**
   * Get time since a timestamp in human-readable format
   */
  getTimeSince(timestamp) {
    const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  }

  /**
   * Get conflict count for an issue
   */
  getConflictCount(issueId) {
    return this.conflictHistory.filter(c => c.issueId === issueId).length;
  }

  /**
   * Get escalation triggers for a conflict
   */
  getEscalationTriggers(conflictResult) {
    const triggers = [];
    
    if (this.getConflictCount(conflictResult.issueId) >= this.escalationConfig.triggers.repeatedConflicts) {
      triggers.push('repeated_conflicts');
    }
    
    if (conflictResult.metadata.priority >= 3) {
      triggers.push('high_priority');
    }
    
    if (conflictResult.conflicts.some(c => c.severity === 'high')) {
      triggers.push('high_severity_conflict');
    }
    
    return triggers;
  }

  /**
   * Record conflict resolution
   */
  recordConflictResolution(conflictResult, strategy, resolution) {
    const record = {
      issueId: conflictResult.issueId,
      conflicts: conflictResult.conflicts,
      strategy,
      resolution,
      timestamp: new Date()
    };

    this.conflictHistory.push(record);
    
    // Trim history if needed
    if (this.conflictHistory.length > this.maxHistorySize) {
      this.conflictHistory = this.conflictHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get conflict statistics
   */
  getStatistics() {
    return {
      ...this.resolutionStats,
      escalationRate: this.resolutionStats.total > 0 
        ? (this.resolutionStats.escalated / this.resolutionStats.total) * 100 
        : 0
    };
  }

  /**
   * Get recent conflicts
   */
  getRecentConflicts(limit = 50) {
    return this.conflictHistory.slice(-limit).reverse();
  }
}

export default ConflictResolver;

