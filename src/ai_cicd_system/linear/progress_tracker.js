/**
 * Linear Progress Tracker
 * 
 * Tracks development progress across Linear issues and provides
 * real-time visibility into project status and milestone completion.
 */

import LinearClient from './linear_client.js';
import logger from '../../../mcp-server/src/logger.js';

export class ProgressTracker {
  constructor(config = {}) {
    this.linearClient = new LinearClient(config.linear);
    this.trackingConfig = config.tracking || this.getDefaultTrackingConfig();
    
    // Progress calculation cache
    this.progressCache = new Map();
    this.cacheExpiry = config.cacheExpiry || 180000; // 3 minutes
    
    // Milestone tracking
    this.milestones = new Map();
    this.progressHistory = [];
  }

  /**
   * Get default tracking configuration
   */
  getDefaultTrackingConfig() {
    return {
      // State weights for progress calculation
      stateWeights: {
        'backlog': 0,
        'todo': 0.1,
        'in_progress': 0.3,
        'in_review': 0.7,
        'ready_for_merge': 0.8,
        'deploying': 0.9,
        'done': 1.0,
        'cancelled': 0, // Cancelled tasks don't contribute to progress
        'blocked': 0.2 // Blocked tasks have minimal progress
      },
      
      // Priority multipliers for weighted progress
      priorityWeights: {
        0: 0.5,  // No priority
        1: 1.0,  // Low
        2: 1.5,  // Medium  
        3: 2.0,  // High
        4: 3.0   // Urgent
      },
      
      // Tracking intervals
      snapshotInterval: 3600000, // 1 hour
      reportingInterval: 86400000, // 24 hours
      
      // Progress thresholds
      thresholds: {
        blocked: 0.1,    // Alert if >10% of tasks are blocked
        overdue: 0.05,   // Alert if >5% of tasks are overdue
        stalled: 0.15    // Alert if >15% of tasks haven't moved in 48h
      }
    };
  }

  /**
   * Calculate progress for a project or milestone
   */
  async calculateProgress(filters = {}) {
    try {
      const cacheKey = this.generateCacheKey(filters);
      const cached = this.progressCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.progress;
      }

      // Fetch issues based on filters
      const issues = await this.linearClient.searchIssues(filters);
      
      if (issues.length === 0) {
        return {
          totalIssues: 0,
          completedIssues: 0,
          progressPercentage: 0,
          weightedProgress: 0,
          breakdown: {},
          blockers: [],
          risks: []
        };
      }

      // Calculate progress metrics
      const progress = this.computeProgressMetrics(issues);
      
      // Cache the result
      this.progressCache.set(cacheKey, {
        progress,
        timestamp: Date.now()
      });

      return progress;
    } catch (error) {
      logger.error('Failed to calculate progress:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Compute detailed progress metrics
   */
  computeProgressMetrics(issues) {
    const metrics = {
      totalIssues: issues.length,
      completedIssues: 0,
      progressPercentage: 0,
      weightedProgress: 0,
      breakdown: {
        byState: {},
        byPriority: {},
        byAssignee: {}
      },
      blockers: [],
      risks: [],
      velocity: null,
      estimatedCompletion: null
    };

    let totalWeight = 0;
    let completedWeight = 0;
    let totalPriorityWeight = 0;
    let completedPriorityWeight = 0;

    // Process each issue
    issues.forEach(issue => {
      const state = issue.state;
      const priority = issue.priority || 0;
      const assignee = issue.assignee?.name || 'Unassigned';

      // State breakdown
      metrics.breakdown.byState[state.name] = (metrics.breakdown.byState[state.name] || 0) + 1;
      
      // Priority breakdown
      const priorityLabel = this.getPriorityLabel(priority);
      metrics.breakdown.byPriority[priorityLabel] = (metrics.breakdown.byPriority[priorityLabel] || 0) + 1;
      
      // Assignee breakdown
      metrics.breakdown.byAssignee[assignee] = (metrics.breakdown.byAssignee[assignee] || 0) + 1;

      // Progress calculation
      const stateWeight = this.trackingConfig.stateWeights[state.type] || 0;
      const priorityWeight = this.trackingConfig.priorityWeights[priority] || 1;

      totalWeight += 1;
      completedWeight += stateWeight;
      
      totalPriorityWeight += priorityWeight;
      completedPriorityWeight += stateWeight * priorityWeight;

      // Count completed issues
      if (stateWeight === 1.0) {
        metrics.completedIssues++;
      }

      // Identify blockers and risks
      if (state.type === 'blocked') {
        metrics.blockers.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          assignee: assignee,
          blockedSince: this.estimateBlockedSince(issue)
        });
      }

      // Identify stalled tasks
      const daysSinceUpdate = this.getDaysSinceUpdate(issue.updatedAt);
      if (daysSinceUpdate > 2 && state.type === 'in_progress') {
        metrics.risks.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          assignee: assignee,
          risk: 'stalled',
          daysSinceUpdate: daysSinceUpdate
        });
      }

      // Identify overdue tasks (if due dates are available)
      if (issue.dueDate && new Date(issue.dueDate) < new Date() && state.type !== 'done') {
        metrics.risks.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          assignee: assignee,
          risk: 'overdue',
          daysOverdue: this.getDaysOverdue(issue.dueDate)
        });
      }
    });

    // Calculate percentages
    metrics.progressPercentage = totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;
    metrics.weightedProgress = totalPriorityWeight > 0 ? (completedPriorityWeight / totalPriorityWeight) * 100 : 0;

    // Calculate velocity and estimated completion
    metrics.velocity = this.calculateVelocity(issues);
    metrics.estimatedCompletion = this.estimateCompletion(metrics);

    return metrics;
  }

  /**
   * Track milestone progress
   */
  async trackMilestone(milestoneId, milestoneConfig) {
    try {
      const filters = {
        project: { id: milestoneConfig.projectId },
        ...milestoneConfig.filters
      };

      const progress = await this.calculateProgress(filters);
      
      const milestone = {
        id: milestoneId,
        name: milestoneConfig.name,
        targetDate: milestoneConfig.targetDate,
        progress: progress,
        lastUpdated: new Date().toISOString(),
        status: this.determineMilestoneStatus(progress, milestoneConfig)
      };

      this.milestones.set(milestoneId, milestone);

      // Record progress snapshot
      this.recordProgressSnapshot(milestoneId, progress);

      logger.info('Milestone progress tracked:', {
        milestoneId,
        name: milestoneConfig.name,
        progress: progress.progressPercentage,
        status: milestone.status
      });

      return milestone;
    } catch (error) {
      logger.error('Failed to track milestone:', { milestoneId, error: error.message });
      throw error;
    }
  }

  /**
   * Get progress trends over time
   */
  getProgressTrends(milestoneId, timeRange = '7d') {
    const cutoff = new Date();
    
    switch (timeRange) {
      case '24h':
        cutoff.setDate(cutoff.getDate() - 1);
        break;
      case '7d':
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      case '30d':
        cutoff.setDate(cutoff.getDate() - 30);
        break;
      default:
        cutoff.setDate(cutoff.getDate() - 7);
    }

    const relevantSnapshots = this.progressHistory.filter(snapshot => 
      snapshot.milestoneId === milestoneId && 
      new Date(snapshot.timestamp) > cutoff
    );

    if (relevantSnapshots.length === 0) {
      return { trend: 'insufficient_data', snapshots: [] };
    }

    // Calculate trend
    const firstSnapshot = relevantSnapshots[0];
    const lastSnapshot = relevantSnapshots[relevantSnapshots.length - 1];
    
    const progressChange = lastSnapshot.progress.progressPercentage - firstSnapshot.progress.progressPercentage;
    const timeSpan = new Date(lastSnapshot.timestamp) - new Date(firstSnapshot.timestamp);
    const dailyVelocity = (progressChange / timeSpan) * 86400000; // Progress per day

    return {
      trend: progressChange > 0 ? 'improving' : progressChange < 0 ? 'declining' : 'stable',
      progressChange: progressChange,
      dailyVelocity: dailyVelocity,
      snapshots: relevantSnapshots,
      timeRange: timeRange
    };
  }

  /**
   * Generate progress report
   */
  async generateProgressReport(filters = {}) {
    try {
      const progress = await this.calculateProgress(filters);
      const timestamp = new Date().toISOString();

      const report = {
        timestamp: timestamp,
        summary: {
          totalIssues: progress.totalIssues,
          completedIssues: progress.completedIssues,
          progressPercentage: Math.round(progress.progressPercentage * 100) / 100,
          weightedProgress: Math.round(progress.weightedProgress * 100) / 100
        },
        breakdown: progress.breakdown,
        health: this.assessProjectHealth(progress),
        blockers: progress.blockers,
        risks: progress.risks,
        velocity: progress.velocity,
        estimatedCompletion: progress.estimatedCompletion,
        recommendations: this.generateRecommendations(progress)
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate progress report:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Assess project health
   */
  assessProjectHealth(progress) {
    const health = {
      score: 100,
      status: 'healthy',
      issues: []
    };

    // Check for high percentage of blocked tasks
    const blockedPercentage = (progress.blockers.length / progress.totalIssues) * 100;
    if (blockedPercentage > this.trackingConfig.thresholds.blocked * 100) {
      health.score -= 20;
      health.issues.push(`High percentage of blocked tasks: ${blockedPercentage.toFixed(1)}%`);
    }

    // Check for overdue tasks
    const overdueCount = progress.risks.filter(risk => risk.risk === 'overdue').length;
    const overduePercentage = (overdueCount / progress.totalIssues) * 100;
    if (overduePercentage > this.trackingConfig.thresholds.overdue * 100) {
      health.score -= 15;
      health.issues.push(`Tasks overdue: ${overdueCount}`);
    }

    // Check for stalled tasks
    const stalledCount = progress.risks.filter(risk => risk.risk === 'stalled').length;
    const stalledPercentage = (stalledCount / progress.totalIssues) * 100;
    if (stalledPercentage > this.trackingConfig.thresholds.stalled * 100) {
      health.score -= 10;
      health.issues.push(`Stalled tasks: ${stalledCount}`);
    }

    // Check velocity
    if (progress.velocity && progress.velocity.current < progress.velocity.average * 0.7) {
      health.score -= 15;
      health.issues.push('Velocity below average');
    }

    // Determine status
    if (health.score >= 80) {
      health.status = 'healthy';
    } else if (health.score >= 60) {
      health.status = 'warning';
    } else {
      health.status = 'critical';
    }

    return health;
  }

  /**
   * Generate recommendations based on progress analysis
   */
  generateRecommendations(progress) {
    const recommendations = [];

    // Blocker recommendations
    if (progress.blockers.length > 0) {
      recommendations.push({
        type: 'blockers',
        priority: 'high',
        message: `Address ${progress.blockers.length} blocked task(s) to improve progress`,
        actions: ['Review blocked tasks', 'Identify dependencies', 'Escalate if needed']
      });
    }

    // Resource allocation recommendations
    const assigneeWorkload = progress.breakdown.byAssignee;
    const maxWorkload = Math.max(...Object.values(assigneeWorkload));
    const avgWorkload = Object.values(assigneeWorkload).reduce((a, b) => a + b, 0) / Object.keys(assigneeWorkload).length;
    
    if (maxWorkload > avgWorkload * 2) {
      recommendations.push({
        type: 'workload',
        priority: 'medium',
        message: 'Uneven workload distribution detected',
        actions: ['Redistribute tasks', 'Consider additional resources', 'Review task complexity']
      });
    }

    // Velocity recommendations
    if (progress.velocity && progress.velocity.trend === 'declining') {
      recommendations.push({
        type: 'velocity',
        priority: 'medium',
        message: 'Velocity is declining',
        actions: ['Identify bottlenecks', 'Review process efficiency', 'Consider team capacity']
      });
    }

    // Priority recommendations
    const highPriorityTasks = progress.breakdown.byPriority['High'] || 0;
    const totalTasks = progress.totalIssues;
    if (highPriorityTasks / totalTasks > 0.5) {
      recommendations.push({
        type: 'priority',
        priority: 'low',
        message: 'Too many high-priority tasks may indicate poor prioritization',
        actions: ['Review task priorities', 'Focus on critical path', 'Defer non-essential work']
      });
    }

    return recommendations;
  }

  /**
   * Helper methods
   */
  generateCacheKey(filters) {
    return JSON.stringify(filters);
  }

  getPriorityLabel(priority) {
    const labels = {
      0: 'None',
      1: 'Low',
      2: 'Medium',
      3: 'High',
      4: 'Urgent'
    };
    return labels[priority] || 'Unknown';
  }

  getDaysSinceUpdate(updatedAt) {
    const now = new Date();
    const updated = new Date(updatedAt);
    return Math.floor((now - updated) / (1000 * 60 * 60 * 24));
  }

  getDaysOverdue(dueDate) {
    const now = new Date();
    const due = new Date(dueDate);
    return Math.floor((now - due) / (1000 * 60 * 60 * 24));
  }

  estimateBlockedSince(issue) {
    // This would ideally use issue history, but for now estimate based on update time
    return this.getDaysSinceUpdate(issue.updatedAt);
  }

  calculateVelocity(issues) {
    // Simple velocity calculation based on completed issues in recent periods
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentCompleted = issues.filter(issue => 
      issue.state.type === 'done' && 
      new Date(issue.updatedAt) > oneWeekAgo
    ).length;

    const previousCompleted = issues.filter(issue => 
      issue.state.type === 'done' && 
      new Date(issue.updatedAt) > twoWeeksAgo &&
      new Date(issue.updatedAt) <= oneWeekAgo
    ).length;

    return {
      current: recentCompleted,
      previous: previousCompleted,
      average: (recentCompleted + previousCompleted) / 2,
      trend: recentCompleted > previousCompleted ? 'improving' : 
             recentCompleted < previousCompleted ? 'declining' : 'stable'
    };
  }

  estimateCompletion(metrics) {
    if (!metrics.velocity || metrics.velocity.current === 0) {
      return null;
    }

    const remainingTasks = metrics.totalIssues - metrics.completedIssues;
    const weeksToCompletion = remainingTasks / metrics.velocity.current;
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + weeksToCompletion * 7);

    return {
      remainingTasks: remainingTasks,
      weeksToCompletion: Math.round(weeksToCompletion * 10) / 10,
      estimatedDate: estimatedDate.toISOString().split('T')[0]
    };
  }

  determineMilestoneStatus(progress, config) {
    const targetDate = new Date(config.targetDate);
    const now = new Date();
    const daysToTarget = Math.floor((targetDate - now) / (1000 * 60 * 60 * 24));

    if (progress.progressPercentage >= 100) {
      return 'completed';
    } else if (daysToTarget < 0) {
      return 'overdue';
    } else if (progress.progressPercentage >= 90) {
      return 'on_track';
    } else if (daysToTarget < 7 && progress.progressPercentage < 80) {
      return 'at_risk';
    } else {
      return 'in_progress';
    }
  }

  recordProgressSnapshot(milestoneId, progress) {
    this.progressHistory.push({
      milestoneId: milestoneId,
      progress: progress,
      timestamp: new Date().toISOString()
    });

    // Maintain history size (keep last 1000 snapshots)
    if (this.progressHistory.length > 1000) {
      this.progressHistory.shift();
    }
  }

  /**
   * Clear progress cache
   */
  clearCache() {
    this.progressCache.clear();
    logger.info('Progress tracker cache cleared');
  }
}

export default ProgressTracker;

