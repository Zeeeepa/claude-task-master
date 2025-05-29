/**
 * Linear Progress Tracker
 * 
 * Calculates completion percentages, tracks milestone progress,
 * generates progress reports, and updates parent issue progress.
 */

export class LinearProgressTracker {
    constructor(config = {}) {
        this.config = {
            teamId: config.teamId || process.env.LINEAR_TEAM_ID,
            enableRealTimeUpdates: config.enableRealTimeUpdates !== false,
            enableMilestoneTracking: config.enableMilestoneTracking !== false,
            enableProgressReports: config.enableProgressReports !== false,
            progressUpdateInterval: config.progressUpdateInterval || 300000, // 5 minutes
            reportGenerationInterval: config.reportGenerationInterval || 3600000, // 1 hour
            weightingStrategy: config.weightingStrategy || 'equal', // 'equal', 'priority', 'complexity'
            ...config
        };

        // Progress calculation strategies
        this.progressStrategies = {
            equal: this.calculateEqualWeightProgress.bind(this),
            priority: this.calculatePriorityWeightedProgress.bind(this),
            complexity: this.calculateComplexityWeightedProgress.bind(this)
        };

        // Status completion mappings
        this.statusCompletionMap = {
            'pending': 0,
            'in_progress': 25,
            'validation': 75,
            'completed': 100,
            'failed': 0,
            'cancelled': 0
        };

        // Linear status completion mappings
        this.linearStatusCompletionMap = {
            'Todo': 0,
            'Backlog': 0,
            'In Progress': 25,
            'In Review': 75,
            'Done': 100,
            'Cancelled': 0
        };

        // Database connection (injected)
        this.database = null;
        
        // API clients (injected)
        this.linearAPI = null;
        this.issueManager = null;
        
        // Progress cache
        this.progressCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
        
        // Update timers
        this.progressUpdateTimer = null;
        this.reportGenerationTimer = null;
    }

    /**
     * Initialize progress tracker
     */
    async initialize(database, linearAPI, issueManager) {
        this.database = database;
        this.linearAPI = linearAPI;
        this.issueManager = issueManager;
        
        // Ensure progress tables exist
        await this.ensureProgressTables();
        
        // Start update timers
        if (this.config.enableRealTimeUpdates) {
            this.startProgressUpdateTimer();
        }
        
        if (this.config.enableProgressReports) {
            this.startReportGenerationTimer();
        }
        
        console.log('Linear Progress Tracker initialized');
    }

    // ==================== PROGRESS CALCULATION ====================

    /**
     * Calculate progress for a task hierarchy
     */
    async calculateTaskProgress(taskId, options = {}) {
        try {
            const cacheKey = `task_${taskId}`;
            
            // Check cache first
            if (!options.forceRefresh) {
                const cached = this.getFromCache(cacheKey);
                if (cached) return cached;
            }

            // Get task and its hierarchy
            const task = await this.getTaskWithHierarchy(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            // Calculate progress based on strategy
            const strategy = this.progressStrategies[this.config.weightingStrategy];
            const progress = await strategy(task);

            // Cache result
            this.setCache(cacheKey, progress);

            return progress;

        } catch (error) {
            throw new Error(`Failed to calculate task progress: ${error.message}`);
        }
    }

    /**
     * Calculate progress for a Linear issue hierarchy
     */
    async calculateLinearIssueProgress(linearIssueId, options = {}) {
        try {
            const cacheKey = `linear_${linearIssueId}`;
            
            // Check cache first
            if (!options.forceRefresh) {
                const cached = this.getFromCache(cacheKey);
                if (cached) return cached;
            }

            // Get issue and its hierarchy
            const issue = await this.getLinearIssueWithHierarchy(linearIssueId);
            if (!issue) {
                throw new Error(`Linear issue ${linearIssueId} not found`);
            }

            // Calculate progress
            const progress = await this.calculateLinearHierarchyProgress(issue);

            // Cache result
            this.setCache(cacheKey, progress);

            return progress;

        } catch (error) {
            throw new Error(`Failed to calculate Linear issue progress: ${error.message}`);
        }
    }

    /**
     * Calculate equal weight progress
     */
    async calculateEqualWeightProgress(task) {
        const children = task.children || [];
        
        if (children.length === 0) {
            // Leaf task - use status completion
            return {
                percentage: this.statusCompletionMap[task.status] || 0,
                completed_tasks: task.status === 'completed' ? 1 : 0,
                total_tasks: 1,
                in_progress_tasks: task.status === 'in_progress' ? 1 : 0,
                failed_tasks: task.status === 'failed' ? 1 : 0,
                details: {
                    task_id: task.id,
                    status: task.status,
                    completion: this.statusCompletionMap[task.status] || 0
                }
            };
        }

        // Parent task - calculate from children
        let totalCompletion = 0;
        let completedTasks = 0;
        let totalTasks = 0;
        let inProgressTasks = 0;
        let failedTasks = 0;
        const childDetails = [];

        for (const child of children) {
            const childProgress = await this.calculateEqualWeightProgress(child);
            
            totalCompletion += childProgress.percentage;
            completedTasks += childProgress.completed_tasks;
            totalTasks += childProgress.total_tasks;
            inProgressTasks += childProgress.in_progress_tasks;
            failedTasks += childProgress.failed_tasks;
            
            childDetails.push(childProgress.details || childProgress);
        }

        const averageCompletion = children.length > 0 ? totalCompletion / children.length : 0;

        return {
            percentage: Math.round(averageCompletion),
            completed_tasks: completedTasks,
            total_tasks: totalTasks,
            in_progress_tasks: inProgressTasks,
            failed_tasks: failedTasks,
            children_count: children.length,
            details: {
                task_id: task.id,
                status: task.status,
                children: childDetails
            }
        };
    }

    /**
     * Calculate priority weighted progress
     */
    async calculatePriorityWeightedProgress(task) {
        const children = task.children || [];
        
        if (children.length === 0) {
            return await this.calculateEqualWeightProgress(task);
        }

        // Calculate weighted progress based on priority
        let totalWeight = 0;
        let weightedCompletion = 0;
        let completedTasks = 0;
        let totalTasks = 0;
        let inProgressTasks = 0;
        let failedTasks = 0;
        const childDetails = [];

        for (const child of children) {
            const childProgress = await this.calculatePriorityWeightedProgress(child);
            const weight = this.getPriorityWeight(child.priority);
            
            totalWeight += weight;
            weightedCompletion += childProgress.percentage * weight;
            completedTasks += childProgress.completed_tasks;
            totalTasks += childProgress.total_tasks;
            inProgressTasks += childProgress.in_progress_tasks;
            failedTasks += childProgress.failed_tasks;
            
            childDetails.push({
                ...childProgress.details || childProgress,
                weight
            });
        }

        const averageCompletion = totalWeight > 0 ? weightedCompletion / totalWeight : 0;

        return {
            percentage: Math.round(averageCompletion),
            completed_tasks: completedTasks,
            total_tasks: totalTasks,
            in_progress_tasks: inProgressTasks,
            failed_tasks: failedTasks,
            children_count: children.length,
            weighting_strategy: 'priority',
            details: {
                task_id: task.id,
                status: task.status,
                total_weight: totalWeight,
                children: childDetails
            }
        };
    }

    /**
     * Calculate complexity weighted progress
     */
    async calculateComplexityWeightedProgress(task) {
        const children = task.children || [];
        
        if (children.length === 0) {
            return await this.calculateEqualWeightProgress(task);
        }

        // Calculate weighted progress based on estimated complexity
        let totalWeight = 0;
        let weightedCompletion = 0;
        let completedTasks = 0;
        let totalTasks = 0;
        let inProgressTasks = 0;
        let failedTasks = 0;
        const childDetails = [];

        for (const child of children) {
            const childProgress = await this.calculateComplexityWeightedProgress(child);
            const weight = this.getComplexityWeight(child);
            
            totalWeight += weight;
            weightedCompletion += childProgress.percentage * weight;
            completedTasks += childProgress.completed_tasks;
            totalTasks += childProgress.total_tasks;
            inProgressTasks += childProgress.in_progress_tasks;
            failedTasks += childProgress.failed_tasks;
            
            childDetails.push({
                ...childProgress.details || childProgress,
                weight
            });
        }

        const averageCompletion = totalWeight > 0 ? weightedCompletion / totalWeight : 0;

        return {
            percentage: Math.round(averageCompletion),
            completed_tasks: completedTasks,
            total_tasks: totalTasks,
            in_progress_tasks: inProgressTasks,
            failed_tasks: failedTasks,
            children_count: children.length,
            weighting_strategy: 'complexity',
            details: {
                task_id: task.id,
                status: task.status,
                total_weight: totalWeight,
                children: childDetails
            }
        };
    }

    /**
     * Calculate Linear hierarchy progress
     */
    async calculateLinearHierarchyProgress(issue) {
        const children = issue.children || [];
        
        if (children.length === 0) {
            // Leaf issue - use status completion
            const completion = this.linearStatusCompletionMap[issue.state.name] || 0;
            return {
                percentage: completion,
                completed_issues: completion === 100 ? 1 : 0,
                total_issues: 1,
                in_progress_issues: completion > 0 && completion < 100 ? 1 : 0,
                details: {
                    issue_id: issue.id,
                    status: issue.state.name,
                    completion
                }
            };
        }

        // Parent issue - calculate from children
        let totalCompletion = 0;
        let completedIssues = 0;
        let totalIssues = 0;
        let inProgressIssues = 0;
        const childDetails = [];

        for (const child of children) {
            const childProgress = await this.calculateLinearHierarchyProgress(child);
            
            totalCompletion += childProgress.percentage;
            completedIssues += childProgress.completed_issues;
            totalIssues += childProgress.total_issues;
            inProgressIssues += childProgress.in_progress_issues;
            
            childDetails.push(childProgress.details || childProgress);
        }

        const averageCompletion = children.length > 0 ? totalCompletion / children.length : 0;

        return {
            percentage: Math.round(averageCompletion),
            completed_issues: completedIssues,
            total_issues: totalIssues,
            in_progress_issues: inProgressIssues,
            children_count: children.length,
            details: {
                issue_id: issue.id,
                status: issue.state.name,
                children: childDetails
            }
        };
    }

    // ==================== PROGRESS UPDATES ====================

    /**
     * Update parent issue progress
     */
    async updateParentIssueProgress(taskId) {
        try {
            // Get correlation
            const correlation = await this.getTaskCorrelation(taskId);
            if (!correlation || !correlation.parent_linear_issue_id) {
                return; // No parent to update
            }

            // Calculate current progress
            const parentTaskId = correlation.parent_task_id;
            if (!parentTaskId) {
                return;
            }

            const progress = await this.calculateTaskProgress(parentTaskId, { forceRefresh: true });
            
            // Update Linear parent issue
            await this.updateLinearIssueProgress(correlation.parent_linear_issue_id, progress);
            
            // Store progress in database
            await this.storeProgressSnapshot(parentTaskId, progress);

        } catch (error) {
            console.error(`Failed to update parent issue progress:`, error);
        }
    }

    /**
     * Update Linear issue progress
     */
    async updateLinearIssueProgress(linearIssueId, progress) {
        try {
            // Create progress comment
            const comment = this.formatProgressComment(progress);
            await this.linearAPI.addComment(linearIssueId, comment);

            // Update issue description with progress if it's a main issue
            const issue = await this.linearAPI.getIssue(linearIssueId);
            if (this.isMainIssue(issue)) {
                const updatedDescription = this.updateDescriptionWithProgress(issue.description, progress);
                await this.linearAPI.updateIssue(linearIssueId, {
                    description: updatedDescription
                });
            }

        } catch (error) {
            console.error(`Failed to update Linear issue progress:`, error);
        }
    }

    /**
     * Bulk update progress for all active tasks
     */
    async bulkUpdateProgress() {
        try {
            console.log('Starting bulk progress update...');
            
            // Get all active parent tasks
            const parentTasks = await this.getActiveParentTasks();
            
            let updated = 0;
            let errors = 0;

            for (const task of parentTasks) {
                try {
                    await this.updateParentIssueProgress(task.id);
                    updated++;
                } catch (error) {
                    console.error(`Failed to update progress for task ${task.id}:`, error);
                    errors++;
                }
            }

            console.log(`Bulk progress update completed: ${updated} updated, ${errors} errors`);
            
            return { updated, errors };

        } catch (error) {
            console.error('Bulk progress update failed:', error);
            throw error;
        }
    }

    // ==================== MILESTONE TRACKING ====================

    /**
     * Track milestone progress
     */
    async trackMilestoneProgress(milestoneId) {
        if (!this.config.enableMilestoneTracking) {
            return null;
        }

        try {
            // Get milestone tasks
            const milestoneTasks = await this.getMilestoneTasks(milestoneId);
            
            if (milestoneTasks.length === 0) {
                return {
                    milestone_id: milestoneId,
                    percentage: 0,
                    total_tasks: 0,
                    completed_tasks: 0,
                    in_progress_tasks: 0,
                    failed_tasks: 0
                };
            }

            // Calculate overall milestone progress
            let totalCompletion = 0;
            let completedTasks = 0;
            let inProgressTasks = 0;
            let failedTasks = 0;

            for (const task of milestoneTasks) {
                const taskProgress = await this.calculateTaskProgress(task.id);
                totalCompletion += taskProgress.percentage;
                completedTasks += taskProgress.completed_tasks;
                inProgressTasks += taskProgress.in_progress_tasks;
                failedTasks += taskProgress.failed_tasks;
            }

            const milestoneProgress = {
                milestone_id: milestoneId,
                percentage: Math.round(totalCompletion / milestoneTasks.length),
                total_tasks: milestoneTasks.length,
                completed_tasks: completedTasks,
                in_progress_tasks: inProgressTasks,
                failed_tasks: failedTasks,
                last_updated: new Date().toISOString()
            };

            // Store milestone progress
            await this.storeMilestoneProgress(milestoneProgress);

            return milestoneProgress;

        } catch (error) {
            throw new Error(`Failed to track milestone progress: ${error.message}`);
        }
    }

    /**
     * Get milestone progress history
     */
    async getMilestoneProgressHistory(milestoneId, days = 30) {
        if (!this.database) {
            return [];
        }

        const query = `
            SELECT * FROM milestone_progress 
            WHERE milestone_id = $1 
            AND created_at > NOW() - INTERVAL '${days} days'
            ORDER BY created_at ASC
        `;

        const result = await this.database.query(query, [milestoneId]);
        return result.rows;
    }

    // ==================== PROGRESS REPORTS ====================

    /**
     * Generate progress report
     */
    async generateProgressReport(options = {}) {
        if (!this.config.enableProgressReports) {
            return null;
        }

        try {
            const {
                includeTaskDetails = true,
                includeMilestones = true,
                includeLinearIssues = true,
                timeframe = 'week' // 'day', 'week', 'month'
            } = options;

            const report = {
                generated_at: new Date().toISOString(),
                timeframe,
                summary: {},
                tasks: [],
                milestones: [],
                linear_issues: []
            };

            // Generate summary
            report.summary = await this.generateProgressSummary(timeframe);

            // Include task details
            if (includeTaskDetails) {
                report.tasks = await this.getTaskProgressSummary(timeframe);
            }

            // Include milestone progress
            if (includeMilestones) {
                report.milestones = await this.getMilestoneProgressSummary(timeframe);
            }

            // Include Linear issue progress
            if (includeLinearIssues) {
                report.linear_issues = await this.getLinearIssueProgressSummary(timeframe);
            }

            // Store report
            await this.storeProgressReport(report);

            return report;

        } catch (error) {
            throw new Error(`Failed to generate progress report: ${error.message}`);
        }
    }

    /**
     * Generate progress summary
     */
    async generateProgressSummary(timeframe) {
        const summary = {
            total_tasks: 0,
            completed_tasks: 0,
            in_progress_tasks: 0,
            failed_tasks: 0,
            overall_completion: 0,
            velocity: 0,
            trends: {}
        };

        // Get task statistics
        const taskStats = await this.getTaskStatistics(timeframe);
        Object.assign(summary, taskStats);

        // Calculate velocity (tasks completed per day)
        const days = this.getTimeframeDays(timeframe);
        summary.velocity = days > 0 ? summary.completed_tasks / days : 0;

        // Get trends
        summary.trends = await this.getProgressTrends(timeframe);

        return summary;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get priority weight
     */
    getPriorityWeight(priority) {
        const weights = {
            'urgent': 4,
            'high': 3,
            'medium': 2,
            'low': 1
        };
        
        if (typeof priority === 'number') {
            return Math.max(1, Math.min(4, priority));
        }
        
        return weights[priority] || 2;
    }

    /**
     * Get complexity weight
     */
    getComplexityWeight(task) {
        // Use estimated duration or complexity score
        if (task.estimated_duration) {
            // Convert duration to hours and use as weight
            const hours = this.parseDurationToHours(task.estimated_duration);
            return Math.max(1, Math.min(10, hours / 8)); // Normalize to 1-10 scale
        }
        
        if (task.complexity_score) {
            return task.complexity_score;
        }
        
        // Default weight based on task type or description length
        const descriptionLength = (task.description || '').length;
        return Math.max(1, Math.min(5, Math.ceil(descriptionLength / 200)));
    }

    /**
     * Parse duration string to hours
     */
    parseDurationToHours(duration) {
        if (typeof duration === 'number') {
            return duration; // Assume hours
        }
        
        if (typeof duration === 'string') {
            const match = duration.match(/(\d+)\s*(h|hour|hours|d|day|days)/i);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                return unit.startsWith('d') ? value * 8 : value; // 8 hours per day
            }
        }
        
        return 1; // Default
    }

    /**
     * Format progress comment
     */
    formatProgressComment(progress) {
        const emoji = progress.percentage === 100 ? '✅' : 
                     progress.percentage >= 75 ? '🟢' :
                     progress.percentage >= 50 ? '🟡' :
                     progress.percentage >= 25 ? '🟠' : '🔴';

        let comment = `${emoji} **Progress Update**\n\n`;
        comment += `**Completion**: ${progress.percentage}%\n`;
        comment += `**Tasks**: ${progress.completed_tasks}/${progress.total_tasks} completed\n`;
        
        if (progress.in_progress_tasks > 0) {
            comment += `**In Progress**: ${progress.in_progress_tasks} tasks\n`;
        }
        
        if (progress.failed_tasks > 0) {
            comment += `**Failed**: ${progress.failed_tasks} tasks\n`;
        }
        
        if (progress.children_count) {
            comment += `**Sub-tasks**: ${progress.children_count}\n`;
        }
        
        comment += `\n_Updated: ${new Date().toISOString()}_`;
        
        return comment;
    }

    /**
     * Update description with progress
     */
    updateDescriptionWithProgress(description, progress) {
        const progressSection = `\n\n## 📊 Progress\n\n` +
                               `- **Completion**: ${progress.percentage}%\n` +
                               `- **Tasks**: ${progress.completed_tasks}/${progress.total_tasks}\n` +
                               `- **Last Updated**: ${new Date().toISOString()}\n`;

        // Remove existing progress section if present
        const progressRegex = /\n\n## 📊 Progress\n\n[\s\S]*?(?=\n\n##|\n\n---|\n\n\*|$)/;
        const cleanDescription = description.replace(progressRegex, '');
        
        return cleanDescription + progressSection;
    }

    /**
     * Check if issue is a main issue
     */
    isMainIssue(issue) {
        // Check for epic label or no parent
        const hasEpicLabel = issue.labels?.some(label => 
            label.name.toLowerCase() === 'epic'
        );
        
        return hasEpicLabel || !issue.parent;
    }

    // ==================== CACHE MANAGEMENT ====================

    /**
     * Get from cache
     */
    getFromCache(key) {
        const cached = this.progressCache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.progressCache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    /**
     * Set cache
     */
    setCache(key, data) {
        this.progressCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.progressCache.clear();
    }

    // ==================== TIMER MANAGEMENT ====================

    /**
     * Start progress update timer
     */
    startProgressUpdateTimer() {
        this.progressUpdateTimer = setInterval(async () => {
            try {
                await this.bulkUpdateProgress();
            } catch (error) {
                console.error('Progress update timer error:', error);
            }
        }, this.config.progressUpdateInterval);
    }

    /**
     * Start report generation timer
     */
    startReportGenerationTimer() {
        this.reportGenerationTimer = setInterval(async () => {
            try {
                await this.generateProgressReport();
            } catch (error) {
                console.error('Report generation timer error:', error);
            }
        }, this.config.reportGenerationInterval);
    }

    /**
     * Stop timers
     */
    stopTimers() {
        if (this.progressUpdateTimer) {
            clearInterval(this.progressUpdateTimer);
            this.progressUpdateTimer = null;
        }
        
        if (this.reportGenerationTimer) {
            clearInterval(this.reportGenerationTimer);
            this.reportGenerationTimer = null;
        }
    }

    // ==================== DATABASE OPERATIONS ====================

    /**
     * Store progress snapshot
     */
    async storeProgressSnapshot(taskId, progress) {
        if (!this.database) return;

        const query = `
            INSERT INTO progress_snapshots (
                task_id, percentage, completed_tasks, total_tasks,
                in_progress_tasks, failed_tasks, details, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        const values = [
            taskId,
            progress.percentage,
            progress.completed_tasks,
            progress.total_tasks,
            progress.in_progress_tasks,
            progress.failed_tasks,
            JSON.stringify(progress.details || {}),
            new Date()
        ];

        await this.database.query(query, values);
    }

    /**
     * Store milestone progress
     */
    async storeMilestoneProgress(milestoneProgress) {
        if (!this.database) return;

        const query = `
            INSERT INTO milestone_progress (
                milestone_id, percentage, total_tasks, completed_tasks,
                in_progress_tasks, failed_tasks, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        const values = [
            milestoneProgress.milestone_id,
            milestoneProgress.percentage,
            milestoneProgress.total_tasks,
            milestoneProgress.completed_tasks,
            milestoneProgress.in_progress_tasks,
            milestoneProgress.failed_tasks,
            new Date()
        ];

        await this.database.query(query, values);
    }

    /**
     * Store progress report
     */
    async storeProgressReport(report) {
        if (!this.database) return;

        const query = `
            INSERT INTO progress_reports (
                timeframe, summary, report_data, created_at
            ) VALUES ($1, $2, $3, $4)
        `;

        const values = [
            report.timeframe,
            JSON.stringify(report.summary),
            JSON.stringify(report),
            new Date()
        ];

        await this.database.query(query, values);
    }

    /**
     * Ensure progress tables exist
     */
    async ensureProgressTables() {
        if (!this.database) return;

        const createTablesQuery = `
            -- Progress snapshots
            CREATE TABLE IF NOT EXISTS progress_snapshots (
                id SERIAL PRIMARY KEY,
                task_id UUID NOT NULL,
                percentage INTEGER NOT NULL,
                completed_tasks INTEGER DEFAULT 0,
                total_tasks INTEGER DEFAULT 0,
                in_progress_tasks INTEGER DEFAULT 0,
                failed_tasks INTEGER DEFAULT 0,
                details JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Milestone progress
            CREATE TABLE IF NOT EXISTS milestone_progress (
                id SERIAL PRIMARY KEY,
                milestone_id VARCHAR(255) NOT NULL,
                percentage INTEGER NOT NULL,
                total_tasks INTEGER DEFAULT 0,
                completed_tasks INTEGER DEFAULT 0,
                in_progress_tasks INTEGER DEFAULT 0,
                failed_tasks INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Progress reports
            CREATE TABLE IF NOT EXISTS progress_reports (
                id SERIAL PRIMARY KEY,
                timeframe VARCHAR(50) NOT NULL,
                summary JSONB NOT NULL,
                report_data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_progress_snapshots_task_id ON progress_snapshots(task_id);
            CREATE INDEX IF NOT EXISTS idx_progress_snapshots_created_at ON progress_snapshots(created_at);
            CREATE INDEX IF NOT EXISTS idx_milestone_progress_milestone_id ON milestone_progress(milestone_id);
            CREATE INDEX IF NOT EXISTS idx_progress_reports_timeframe ON progress_reports(timeframe);
        `;

        await this.database.query(createTablesQuery);
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Get progress tracker status
     */
    getStatus() {
        return {
            config: {
                real_time_updates: this.config.enableRealTimeUpdates,
                milestone_tracking: this.config.enableMilestoneTracking,
                progress_reports: this.config.enableProgressReports,
                weighting_strategy: this.config.weightingStrategy,
                update_interval: this.config.progressUpdateInterval,
                report_interval: this.config.reportGenerationInterval
            },
            cache: {
                size: this.progressCache.size,
                timeout: this.cacheTimeout
            },
            timers: {
                progress_update_active: !!this.progressUpdateTimer,
                report_generation_active: !!this.reportGenerationTimer
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.stopTimers();
        this.clearCache();
    }
}

export default LinearProgressTracker;

