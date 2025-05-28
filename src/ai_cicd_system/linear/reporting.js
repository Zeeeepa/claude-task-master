/**
 * Linear Reporting and Analytics
 * 
 * Provides comprehensive reporting and analytics for Linear integration,
 * including progress reports, performance metrics, and trend analysis.
 */

import LinearClient from './linear_client.js';
import ProgressTracker from './progress_tracker.js';
import StatusManager from './status_manager.js';
import logger from '../../../mcp-server/src/logger.js';

export class LinearReporting {
  constructor(config = {}) {
    this.linearClient = new LinearClient(config.linear);
    this.progressTracker = new ProgressTracker(config);
    this.statusManager = new StatusManager(config);
    
    this.reportConfig = config.reporting || this.getDefaultReportConfig();
    
    // Report cache
    this.reportCache = new Map();
    this.cacheExpiry = config.cacheExpiry || 600000; // 10 minutes
    
    // Report history
    this.reportHistory = [];
    this.maxHistorySize = config.maxHistorySize || 100;
  }

  /**
   * Get default report configuration
   */
  getDefaultReportConfig() {
    return {
      // Report types and their configurations
      types: {
        daily: {
          schedule: '0 9 * * *', // 9 AM daily
          recipients: ['team-leads', 'project-managers'],
          sections: ['summary', 'progress', 'blockers', 'velocity']
        },
        weekly: {
          schedule: '0 9 * * 1', // 9 AM Monday
          recipients: ['stakeholders', 'executives'],
          sections: ['summary', 'progress', 'trends', 'milestones', 'recommendations']
        },
        monthly: {
          schedule: '0 9 1 * *', // 9 AM first day of month
          recipients: ['executives', 'board'],
          sections: ['executive-summary', 'achievements', 'metrics', 'forecasts']
        }
      },
      
      // Output formats
      formats: {
        json: true,
        markdown: true,
        html: false,
        pdf: false
      },
      
      // Metrics configuration
      metrics: {
        velocity: {
          periods: ['1w', '2w', '4w'],
          smoothing: true
        },
        burndown: {
          includeWeekends: false,
          projectionDays: 30
        },
        efficiency: {
          cycleTimeThreshold: 7, // days
          leadTimeThreshold: 14  // days
        }
      }
    };
  }

  /**
   * Generate comprehensive project report
   */
  async generateProjectReport(projectId, options = {}) {
    try {
      const cacheKey = `project_report_${projectId}_${JSON.stringify(options)}`;
      const cached = this.reportCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.report;
      }

      logger.info('Generating project report:', { projectId, options });

      // Gather data
      const [
        projectData,
        progressData,
        velocityData,
        issueMetrics,
        teamMetrics
      ] = await Promise.all([
        this.getProjectData(projectId),
        this.getProgressData(projectId),
        this.getVelocityData(projectId),
        this.getIssueMetrics(projectId),
        this.getTeamMetrics(projectId)
      ]);

      // Generate report sections
      const report = {
        metadata: {
          projectId,
          projectName: projectData.name,
          generatedAt: new Date().toISOString(),
          reportType: options.type || 'standard',
          timeRange: options.timeRange || '30d'
        },
        
        executiveSummary: this.generateExecutiveSummary(projectData, progressData, velocityData),
        
        progress: {
          overall: progressData,
          milestones: await this.getMilestoneProgress(projectId),
          burndown: await this.generateBurndownChart(projectId, options.timeRange)
        },
        
        velocity: {
          current: velocityData,
          trends: await this.getVelocityTrends(projectId),
          forecasts: this.generateVelocityForecasts(velocityData)
        },
        
        issues: {
          metrics: issueMetrics,
          distribution: await this.getIssueDistribution(projectId),
          blockers: await this.getBlockerAnalysis(projectId),
          risks: await this.getRiskAnalysis(projectId)
        },
        
        team: {
          metrics: teamMetrics,
          workload: await this.getWorkloadAnalysis(projectId),
          performance: await this.getTeamPerformance(projectId)
        },
        
        recommendations: await this.generateRecommendations(projectData, progressData, velocityData, issueMetrics),
        
        appendix: {
          methodology: this.getMethodologyNotes(),
          glossary: this.getGlossary()
        }
      };

      // Cache the report
      this.reportCache.set(cacheKey, {
        report,
        timestamp: Date.now()
      });

      // Store in history
      this.storeReportInHistory(report);

      logger.info('Project report generated successfully:', {
        projectId,
        sections: Object.keys(report).length,
        issueCount: issueMetrics.total
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate project report:', {
        projectId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate team performance report
   */
  async generateTeamReport(teamId, options = {}) {
    try {
      logger.info('Generating team report:', { teamId, options });

      const timeRange = options.timeRange || '30d';
      const teamData = await this.getTeamData(teamId);
      
      const report = {
        metadata: {
          teamId,
          teamName: teamData.name,
          generatedAt: new Date().toISOString(),
          timeRange
        },
        
        summary: await this.generateTeamSummary(teamId, timeRange),
        
        productivity: {
          velocity: await this.getTeamVelocity(teamId, timeRange),
          throughput: await this.getTeamThroughput(teamId, timeRange),
          cycleTime: await this.getTeamCycleTime(teamId, timeRange)
        },
        
        workload: {
          distribution: await this.getTeamWorkloadDistribution(teamId),
          capacity: await this.getTeamCapacityAnalysis(teamId),
          utilization: await this.getTeamUtilization(teamId, timeRange)
        },
        
        quality: {
          defectRate: await this.getDefectRate(teamId, timeRange),
          reworkRate: await this.getReworkRate(teamId, timeRange),
          reviewEfficiency: await this.getReviewEfficiency(teamId, timeRange)
        },
        
        collaboration: {
          crossFunctional: await this.getCrossFunctionalMetrics(teamId, timeRange),
          knowledgeSharing: await this.getKnowledgeSharingMetrics(teamId, timeRange)
        },
        
        trends: await this.getTeamTrends(teamId, timeRange),
        recommendations: await this.generateTeamRecommendations(teamId, timeRange)
      };

      return report;

    } catch (error) {
      logger.error('Failed to generate team report:', {
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate executive dashboard
   */
  async generateExecutiveDashboard(options = {}) {
    try {
      logger.info('Generating executive dashboard:', options);

      const timeRange = options.timeRange || '90d';
      
      const dashboard = {
        metadata: {
          generatedAt: new Date().toISOString(),
          timeRange,
          scope: options.scope || 'organization'
        },
        
        kpis: await this.getExecutiveKPIs(timeRange),
        
        portfolio: {
          overview: await this.getPortfolioOverview(),
          health: await this.getPortfolioHealth(),
          risks: await this.getPortfolioRisks()
        },
        
        delivery: {
          throughput: await this.getOrganizationThroughput(timeRange),
          predictability: await this.getDeliveryPredictability(timeRange),
          quality: await this.getDeliveryQuality(timeRange)
        },
        
        resources: {
          utilization: await this.getResourceUtilization(timeRange),
          capacity: await this.getCapacityForecast(),
          allocation: await this.getResourceAllocation()
        },
        
        trends: await this.getExecutiveTrends(timeRange),
        alerts: await this.getExecutiveAlerts(),
        recommendations: await this.generateExecutiveRecommendations()
      };

      return dashboard;

    } catch (error) {
      logger.error('Failed to generate executive dashboard:', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate custom report based on filters
   */
  async generateCustomReport(filters, options = {}) {
    try {
      logger.info('Generating custom report:', { filters, options });

      // Fetch issues based on filters
      const issues = await this.linearClient.searchIssues(filters);
      
      // Calculate metrics
      const metrics = await this.calculateCustomMetrics(issues, options);
      
      const report = {
        metadata: {
          generatedAt: new Date().toISOString(),
          filters,
          options,
          issueCount: issues.length
        },
        
        summary: this.generateCustomSummary(issues, metrics),
        metrics: metrics,
        breakdown: this.generateCustomBreakdown(issues, options.groupBy),
        trends: await this.generateCustomTrends(issues, options.timeRange),
        
        charts: options.includeCharts ? await this.generateCharts(issues, metrics) : null,
        rawData: options.includeRawData ? issues : null
      };

      return report;

    } catch (error) {
      logger.error('Failed to generate custom report:', {
        filters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Export report in specified format
   */
  async exportReport(report, format = 'json', options = {}) {
    try {
      switch (format.toLowerCase()) {
        case 'json':
          return this.exportAsJSON(report, options);
        
        case 'markdown':
          return this.exportAsMarkdown(report, options);
        
        case 'html':
          return this.exportAsHTML(report, options);
        
        case 'csv':
          return this.exportAsCSV(report, options);
        
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to export report:', {
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Helper methods for data gathering
   */
  async getProjectData(projectId) {
    // Fetch project details from Linear
    const query = `
      query GetProject($id: String!) {
        project(id: $id) {
          id
          name
          description
          state
          progress
          targetDate
          startDate
          lead {
            id
            name
          }
          teams {
            nodes {
              id
              name
            }
          }
          members {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    const result = await this.linearClient.executeQuery(query, { id: projectId });
    return result.project;
  }

  async getProgressData(projectId) {
    return this.progressTracker.calculateProgress({
      project: { id: projectId }
    });
  }

  async getVelocityData(projectId) {
    // Calculate velocity metrics for the project
    const issues = await this.linearClient.searchIssues({
      project: { id: projectId },
      state: { type: { in: ['done'] } }
    });

    return this.calculateVelocityMetrics(issues);
  }

  async getIssueMetrics(projectId) {
    const issues = await this.linearClient.searchIssues({
      project: { id: projectId }
    });

    return {
      total: issues.length,
      byState: this.groupBy(issues, 'state.name'),
      byPriority: this.groupBy(issues, 'priority'),
      byAssignee: this.groupBy(issues, 'assignee.name'),
      avgCycleTime: this.calculateAverageCycleTime(issues),
      avgLeadTime: this.calculateAverageLeadTime(issues)
    };
  }

  async getTeamMetrics(projectId) {
    // Get team metrics for the project
    const project = await this.getProjectData(projectId);
    const teams = project.teams.nodes;

    const teamMetrics = {};
    for (const team of teams) {
      teamMetrics[team.name] = await this.calculateTeamMetrics(team.id, projectId);
    }

    return teamMetrics;
  }

  /**
   * Report generation helpers
   */
  generateExecutiveSummary(projectData, progressData, velocityData) {
    const completionPercentage = Math.round(progressData.progressPercentage);
    const remainingTasks = progressData.totalIssues - progressData.completedIssues;
    
    return {
      status: this.determineProjectStatus(progressData, velocityData),
      completion: `${completionPercentage}% complete`,
      remainingWork: `${remainingTasks} tasks remaining`,
      velocity: `${velocityData.current} tasks/week`,
      estimatedCompletion: progressData.estimatedCompletion?.estimatedDate,
      keyRisks: progressData.risks.slice(0, 3),
      keyAchievements: this.identifyKeyAchievements(progressData, velocityData)
    };
  }

  async generateRecommendations(projectData, progressData, velocityData, issueMetrics) {
    const recommendations = [];

    // Velocity recommendations
    if (velocityData.trend === 'declining') {
      recommendations.push({
        type: 'velocity',
        priority: 'high',
        title: 'Address Declining Velocity',
        description: 'Team velocity has been declining. Consider reviewing workload and removing blockers.',
        actions: ['Review current blockers', 'Assess team capacity', 'Optimize workflow']
      });
    }

    // Blocker recommendations
    if (progressData.blockers.length > 0) {
      recommendations.push({
        type: 'blockers',
        priority: 'high',
        title: 'Resolve Blocked Tasks',
        description: `${progressData.blockers.length} tasks are currently blocked.`,
        actions: ['Review blocked tasks', 'Escalate dependencies', 'Provide alternative solutions']
      });
    }

    // Workload recommendations
    const workloadImbalance = this.detectWorkloadImbalance(issueMetrics.byAssignee);
    if (workloadImbalance.detected) {
      recommendations.push({
        type: 'workload',
        priority: 'medium',
        title: 'Balance Team Workload',
        description: 'Uneven workload distribution detected across team members.',
        actions: ['Redistribute tasks', 'Review capacity planning', 'Consider additional resources']
      });
    }

    return recommendations;
  }

  /**
   * Export format implementations
   */
  exportAsJSON(report, options) {
    return JSON.stringify(report, null, options.pretty ? 2 : 0);
  }

  exportAsMarkdown(report, options) {
    let markdown = `# ${report.metadata.projectName || 'Project'} Report\n\n`;
    markdown += `Generated: ${report.metadata.generatedAt}\n\n`;

    // Executive Summary
    if (report.executiveSummary) {
      markdown += `## Executive Summary\n\n`;
      markdown += `- **Status**: ${report.executiveSummary.status}\n`;
      markdown += `- **Completion**: ${report.executiveSummary.completion}\n`;
      markdown += `- **Remaining Work**: ${report.executiveSummary.remainingWork}\n`;
      markdown += `- **Velocity**: ${report.executiveSummary.velocity}\n\n`;
    }

    // Progress
    if (report.progress) {
      markdown += `## Progress\n\n`;
      markdown += `- **Overall Progress**: ${Math.round(report.progress.overall.progressPercentage)}%\n`;
      markdown += `- **Completed Issues**: ${report.progress.overall.completedIssues}\n`;
      markdown += `- **Total Issues**: ${report.progress.overall.totalIssues}\n\n`;
    }

    // Issues
    if (report.issues) {
      markdown += `## Issues Breakdown\n\n`;
      
      if (report.issues.distribution) {
        markdown += `### By State\n\n`;
        Object.entries(report.issues.distribution.byState || {}).forEach(([state, count]) => {
          markdown += `- **${state}**: ${count}\n`;
        });
        markdown += '\n';
      }

      if (report.issues.blockers && report.issues.blockers.length > 0) {
        markdown += `### Blockers\n\n`;
        report.issues.blockers.forEach(blocker => {
          markdown += `- **${blocker.identifier}**: ${blocker.title}\n`;
        });
        markdown += '\n';
      }
    }

    // Recommendations
    if (report.recommendations && report.recommendations.length > 0) {
      markdown += `## Recommendations\n\n`;
      report.recommendations.forEach(rec => {
        markdown += `### ${rec.title} (${rec.priority})\n\n`;
        markdown += `${rec.description}\n\n`;
        if (rec.actions) {
          markdown += `**Actions:**\n`;
          rec.actions.forEach(action => {
            markdown += `- ${action}\n`;
          });
          markdown += '\n';
        }
      });
    }

    return markdown;
  }

  exportAsHTML(report, options) {
    // Basic HTML export - could be enhanced with templates
    const markdown = this.exportAsMarkdown(report, options);
    
    // Simple markdown to HTML conversion
    let html = markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${report.metadata.projectName || 'Project'} Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1, h2, h3 { color: #333; }
          li { margin: 5px 0; }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `;
  }

  exportAsCSV(report, options) {
    // Export key metrics as CSV
    const rows = [];
    
    // Headers
    rows.push(['Metric', 'Value', 'Category']);
    
    // Add metrics
    if (report.progress) {
      rows.push(['Progress Percentage', report.progress.overall.progressPercentage, 'Progress']);
      rows.push(['Completed Issues', report.progress.overall.completedIssues, 'Progress']);
      rows.push(['Total Issues', report.progress.overall.totalIssues, 'Progress']);
    }

    if (report.velocity) {
      rows.push(['Current Velocity', report.velocity.current.current, 'Velocity']);
      rows.push(['Average Velocity', report.velocity.current.average, 'Velocity']);
    }

    // Convert to CSV string
    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  /**
   * Utility methods
   */
  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const value = this.getNestedValue(item, key) || 'Unknown';
      groups[value] = (groups[value] || 0) + 1;
      return groups;
    }, {});
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  calculateVelocityMetrics(issues) {
    // Simple velocity calculation
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeek = issues.filter(issue => 
      new Date(issue.updatedAt) > oneWeekAgo
    ).length;

    const lastWeek = issues.filter(issue => 
      new Date(issue.updatedAt) > twoWeeksAgo &&
      new Date(issue.updatedAt) <= oneWeekAgo
    ).length;

    return {
      current: thisWeek,
      previous: lastWeek,
      average: (thisWeek + lastWeek) / 2,
      trend: thisWeek > lastWeek ? 'improving' : thisWeek < lastWeek ? 'declining' : 'stable'
    };
  }

  calculateAverageCycleTime(issues) {
    // Simplified cycle time calculation
    const completedIssues = issues.filter(issue => issue.state.type === 'done');
    
    if (completedIssues.length === 0) return 0;

    const totalCycleTime = completedIssues.reduce((total, issue) => {
      const created = new Date(issue.createdAt);
      const completed = new Date(issue.updatedAt);
      return total + (completed - created);
    }, 0);

    return Math.round(totalCycleTime / completedIssues.length / (1000 * 60 * 60 * 24)); // Days
  }

  calculateAverageLeadTime(issues) {
    // Similar to cycle time but could include different start/end points
    return this.calculateAverageCycleTime(issues);
  }

  determineProjectStatus(progressData, velocityData) {
    if (progressData.progressPercentage >= 100) return 'Completed';
    if (progressData.progressPercentage >= 90) return 'Nearly Complete';
    if (progressData.blockers.length > progressData.totalIssues * 0.1) return 'Blocked';
    if (velocityData.trend === 'declining') return 'At Risk';
    if (progressData.progressPercentage >= 50) return 'On Track';
    return 'In Progress';
  }

  identifyKeyAchievements(progressData, velocityData) {
    const achievements = [];
    
    if (progressData.progressPercentage >= 50) {
      achievements.push('Reached 50% completion milestone');
    }
    
    if (velocityData.trend === 'improving') {
      achievements.push('Team velocity is improving');
    }
    
    if (progressData.blockers.length === 0) {
      achievements.push('No current blockers');
    }

    return achievements;
  }

  detectWorkloadImbalance(assigneeDistribution) {
    const counts = Object.values(assigneeDistribution);
    if (counts.length < 2) return { detected: false };

    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const ratio = max / min;

    return {
      detected: ratio > 2, // Flag if max is more than 2x min
      ratio: ratio,
      maxWorkload: max,
      minWorkload: min
    };
  }

  storeReportInHistory(report) {
    this.reportHistory.push({
      timestamp: new Date().toISOString(),
      type: report.metadata.reportType,
      projectId: report.metadata.projectId,
      summary: {
        issueCount: report.issues?.metrics?.total,
        progress: report.progress?.overall?.progressPercentage
      }
    });

    // Maintain history size
    if (this.reportHistory.length > this.maxHistorySize) {
      this.reportHistory.shift();
    }
  }

  getMethodologyNotes() {
    return {
      velocityCalculation: 'Velocity is calculated as the number of completed issues per week',
      progressCalculation: 'Progress is calculated based on issue state weights',
      cycleTime: 'Cycle time is measured from issue creation to completion',
      dataSource: 'All data is sourced from Linear API'
    };
  }

  getGlossary() {
    return {
      'Velocity': 'The rate at which work is completed, measured in issues per time period',
      'Cycle Time': 'The time from when work starts on an issue to when it is completed',
      'Lead Time': 'The time from when an issue is created to when it is completed',
      'Burndown': 'A chart showing remaining work over time',
      'Throughput': 'The number of items completed in a given time period'
    };
  }

  /**
   * Clear report cache
   */
  clearCache() {
    this.reportCache.clear();
    logger.info('Report cache cleared');
  }

  /**
   * Get report generation statistics
   */
  getStatistics() {
    return {
      cacheSize: this.reportCache.size,
      historySize: this.reportHistory.length,
      recentReports: this.reportHistory.slice(-5)
    };
  }
}

export default LinearReporting;

