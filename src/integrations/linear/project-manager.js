/**
 * Linear Project Manager
 * 
 * Handles automatic project assignment, project-based issue organization,
 * project progress tracking, and project milestone management.
 */

export class LinearProjectManager {
    constructor(config = {}) {
        this.config = {
            teamId: config.teamId || process.env.LINEAR_TEAM_ID,
            defaultProjectId: config.defaultProjectId || process.env.LINEAR_PROJECT_ID,
            enableAutoAssignment: config.enableAutoAssignment !== false,
            enableProgressTracking: config.enableProgressTracking !== false,
            enableMilestoneManagement: config.enableMilestoneManagement !== false,
            projectSyncInterval: config.projectSyncInterval || 600000, // 10 minutes
            ...config
        };

        // Project assignment rules
        this.assignmentRules = [
            {
                name: 'epic_to_main_project',
                condition: (issue) => this.hasLabel(issue, 'epic'),
                projectId: this.config.defaultProjectId,
                priority: 1
            },
            {
                name: 'task_master_to_main_project',
                condition: (issue) => this.hasLabel(issue, 'task-master'),
                projectId: this.config.defaultProjectId,
                priority: 2
            },
            {
                name: 'bug_to_maintenance_project',
                condition: (issue) => this.hasLabel(issue, 'bug'),
                projectId: null, // Will be resolved dynamically
                priority: 3
            },
            {
                name: 'feature_to_development_project',
                condition: (issue) => this.hasLabel(issue, 'feature'),
                projectId: null, // Will be resolved dynamically
                priority: 4
            }
        ];

        // Project templates
        this.projectTemplates = {
            epic: {
                name: 'Epic: {title}',
                description: 'Project for managing epic: {title}',
                state: 'planned',
                targetDate: null
            },
            milestone: {
                name: 'Milestone: {title}',
                description: 'Project for milestone: {title}',
                state: 'planned',
                targetDate: '{target_date}'
            },
            feature: {
                name: 'Feature: {title}',
                description: 'Development project for feature: {title}',
                state: 'started',
                targetDate: null
            }
        };

        // Database connection (injected)
        this.database = null;
        
        // API clients (injected)
        this.linearAPI = null;
        this.progressTracker = null;
        
        // Project cache
        this.projectCache = new Map();
        this.cacheTimeout = 600000; // 10 minutes
        
        // Sync timer
        this.syncTimer = null;
    }

    /**
     * Initialize project manager
     */
    async initialize(database, linearAPI, progressTracker) {
        this.database = database;
        this.linearAPI = linearAPI;
        this.progressTracker = progressTracker;
        
        // Ensure project tables exist
        await this.ensureProjectTables();
        
        // Load project assignment rules from database
        await this.loadAssignmentRules();
        
        // Start sync timer
        if (this.config.enableProgressTracking) {
            this.startSyncTimer();
        }
        
        console.log('Linear Project Manager initialized');
    }

    // ==================== PROJECT ASSIGNMENT ====================

    /**
     * Auto-assign issue to project
     */
    async autoAssignIssueToProject(issue) {
        if (!this.config.enableAutoAssignment) {
            return null;
        }

        try {
            // Find matching assignment rule
            const rule = this.findMatchingRule(issue);
            if (!rule) {
                console.log(`No assignment rule matched for issue ${issue.id}`);
                return null;
            }

            // Get or resolve project ID
            let projectId = rule.projectId;
            if (!projectId) {
                projectId = await this.resolveProjectId(rule, issue);
            }

            if (!projectId) {
                console.warn(`Could not resolve project ID for rule ${rule.name}`);
                return null;
            }

            // Assign issue to project
            await this.assignIssueToProject(issue.id, projectId, {
                rule: rule.name,
                auto_assigned: true
            });

            return {
                project_id: projectId,
                rule: rule.name,
                assigned_at: new Date().toISOString()
            };

        } catch (error) {
            console.error(`Failed to auto-assign issue to project:`, error);
            return null;
        }
    }

    /**
     * Assign issue to project
     */
    async assignIssueToProject(issueId, projectId, metadata = {}) {
        try {
            // Update issue in Linear
            await this.linearAPI.updateIssue(issueId, {
                projectId: projectId
            });

            // Store assignment in database
            await this.storeProjectAssignment({
                issue_id: issueId,
                project_id: projectId,
                assigned_by: metadata.assigned_by || 'system',
                assignment_rule: metadata.rule,
                metadata: metadata,
                assigned_at: new Date()
            });

            // Add comment about project assignment
            if (metadata.auto_assigned) {
                const project = await this.getProject(projectId);
                const comment = `🗂️ **Auto-assigned to Project**\n\n` +
                               `**Project**: ${project?.name || projectId}\n` +
                               `**Rule**: ${metadata.rule}\n\n` +
                               `_Assigned by Task Master automation_`;
                
                await this.linearAPI.addComment(issueId, comment);
            }

            return { success: true, project_id: projectId };

        } catch (error) {
            throw new Error(`Failed to assign issue to project: ${error.message}`);
        }
    }

    /**
     * Find matching assignment rule
     */
    findMatchingRule(issue) {
        // Sort rules by priority
        const sortedRules = [...this.assignmentRules].sort((a, b) => a.priority - b.priority);
        
        for (const rule of sortedRules) {
            if (rule.condition(issue)) {
                return rule;
            }
        }
        
        return null;
    }

    /**
     * Resolve project ID dynamically
     */
    async resolveProjectId(rule, issue) {
        switch (rule.name) {
            case 'bug_to_maintenance_project':
                return await this.getOrCreateMaintenanceProject();
                
            case 'feature_to_development_project':
                return await this.getOrCreateDevelopmentProject();
                
            default:
                return this.config.defaultProjectId;
        }
    }

    // ==================== PROJECT CREATION ====================

    /**
     * Create project from template
     */
    async createProjectFromTemplate(templateName, data) {
        const template = this.projectTemplates[templateName];
        if (!template) {
            throw new Error(`Project template '${templateName}' not found`);
        }

        try {
            // Interpolate template values
            const projectData = {
                name: this.interpolateTemplate(template.name, data),
                description: this.interpolateTemplate(template.description, data),
                state: template.state,
                teamId: this.config.teamId,
                targetDate: template.targetDate ? this.interpolateTemplate(template.targetDate, data) : null
            };

            // Create project in Linear
            const project = await this.linearAPI.createProject(projectData);

            // Store project metadata
            await this.storeProjectMetadata({
                project_id: project.id,
                template_name: templateName,
                template_data: data,
                created_by: 'task_master',
                created_at: new Date()
            });

            return project;

        } catch (error) {
            throw new Error(`Failed to create project from template: ${error.message}`);
        }
    }

    /**
     * Create epic project
     */
    async createEpicProject(epic) {
        return await this.createProjectFromTemplate('epic', {
            title: epic.title,
            description: epic.description
        });
    }

    /**
     * Create milestone project
     */
    async createMilestoneProject(milestone) {
        return await this.createProjectFromTemplate('milestone', {
            title: milestone.title,
            description: milestone.description,
            target_date: milestone.target_date
        });
    }

    /**
     * Get or create maintenance project
     */
    async getOrCreateMaintenanceProject() {
        const cacheKey = 'maintenance_project';
        let projectId = this.getFromCache(cacheKey);
        
        if (projectId) {
            return projectId;
        }

        // Try to find existing maintenance project
        const projects = await this.linearAPI.getTeamProjects(this.config.teamId);
        let maintenanceProject = projects.find(p => 
            p.name.toLowerCase().includes('maintenance') || 
            p.name.toLowerCase().includes('bug')
        );

        if (!maintenanceProject) {
            // Create maintenance project
            maintenanceProject = await this.linearAPI.createProject({
                name: 'Maintenance & Bug Fixes',
                description: 'Project for managing maintenance tasks and bug fixes',
                teamId: this.config.teamId,
                state: 'started'
            });
        }

        this.setCache(cacheKey, maintenanceProject.id);
        return maintenanceProject.id;
    }

    /**
     * Get or create development project
     */
    async getOrCreateDevelopmentProject() {
        const cacheKey = 'development_project';
        let projectId = this.getFromCache(cacheKey);
        
        if (projectId) {
            return projectId;
        }

        // Try to find existing development project
        const projects = await this.linearAPI.getTeamProjects(this.config.teamId);
        let developmentProject = projects.find(p => 
            p.name.toLowerCase().includes('development') || 
            p.name.toLowerCase().includes('feature')
        );

        if (!developmentProject) {
            // Create development project
            developmentProject = await this.linearAPI.createProject({
                name: 'Feature Development',
                description: 'Project for managing feature development tasks',
                teamId: this.config.teamId,
                state: 'started'
            });
        }

        this.setCache(cacheKey, developmentProject.id);
        return developmentProject.id;
    }

    // ==================== PROJECT PROGRESS TRACKING ====================

    /**
     * Track project progress
     */
    async trackProjectProgress(projectId) {
        if (!this.config.enableProgressTracking) {
            return null;
        }

        try {
            // Get project issues
            const issues = await this.getProjectIssues(projectId);
            
            if (issues.length === 0) {
                return {
                    project_id: projectId,
                    percentage: 0,
                    total_issues: 0,
                    completed_issues: 0,
                    in_progress_issues: 0,
                    todo_issues: 0
                };
            }

            // Calculate progress
            let completedIssues = 0;
            let inProgressIssues = 0;
            let todoIssues = 0;

            for (const issue of issues) {
                switch (issue.state.type) {
                    case 'completed':
                        completedIssues++;
                        break;
                    case 'started':
                        inProgressIssues++;
                        break;
                    case 'unstarted':
                        todoIssues++;
                        break;
                }
            }

            const percentage = Math.round((completedIssues / issues.length) * 100);

            const progress = {
                project_id: projectId,
                percentage,
                total_issues: issues.length,
                completed_issues: completedIssues,
                in_progress_issues: inProgressIssues,
                todo_issues: todoIssues,
                last_updated: new Date().toISOString()
            };

            // Store progress
            await this.storeProjectProgress(progress);

            // Update project if needed
            await this.updateProjectWithProgress(projectId, progress);

            return progress;

        } catch (error) {
            throw new Error(`Failed to track project progress: ${error.message}`);
        }
    }

    /**
     * Update project with progress information
     */
    async updateProjectWithProgress(projectId, progress) {
        try {
            const project = await this.getProject(projectId);
            if (!project) {
                return;
            }

            // Update project description with progress
            const updatedDescription = this.updateProjectDescriptionWithProgress(
                project.description, 
                progress
            );

            await this.linearAPI.updateProject(projectId, {
                description: updatedDescription
            });

        } catch (error) {
            console.error(`Failed to update project with progress:`, error);
        }
    }

    /**
     * Bulk update project progress
     */
    async bulkUpdateProjectProgress() {
        try {
            console.log('Starting bulk project progress update...');
            
            // Get all active projects
            const projects = await this.getActiveProjects();
            
            let updated = 0;
            let errors = 0;

            for (const project of projects) {
                try {
                    await this.trackProjectProgress(project.id);
                    updated++;
                } catch (error) {
                    console.error(`Failed to update progress for project ${project.id}:`, error);
                    errors++;
                }
            }

            console.log(`Bulk project progress update completed: ${updated} updated, ${errors} errors`);
            
            return { updated, errors };

        } catch (error) {
            console.error('Bulk project progress update failed:', error);
            throw error;
        }
    }

    // ==================== PROJECT MILESTONE MANAGEMENT ====================

    /**
     * Create project milestone
     */
    async createProjectMilestone(projectId, milestoneData) {
        if (!this.config.enableMilestoneManagement) {
            return null;
        }

        try {
            const milestone = {
                id: this.generateMilestoneId(),
                project_id: projectId,
                name: milestoneData.name,
                description: milestoneData.description,
                target_date: milestoneData.target_date,
                status: 'active',
                created_at: new Date()
            };

            // Store milestone
            await this.storeProjectMilestone(milestone);

            // Create milestone issue in Linear if requested
            if (milestoneData.create_linear_issue) {
                const milestoneIssue = await this.linearAPI.createIssue({
                    teamId: this.config.teamId,
                    projectId: projectId,
                    title: `🎯 Milestone: ${milestone.name}`,
                    description: this.formatMilestoneDescription(milestone),
                    priority: 2, // High priority
                    labelIds: await this.getMilestoneLabels()
                });

                milestone.linear_issue_id = milestoneIssue.id;
                await this.updateProjectMilestone(milestone.id, { linear_issue_id: milestoneIssue.id });
            }

            return milestone;

        } catch (error) {
            throw new Error(`Failed to create project milestone: ${error.message}`);
        }
    }

    /**
     * Update milestone progress
     */
    async updateMilestoneProgress(milestoneId) {
        try {
            const milestone = await this.getProjectMilestone(milestoneId);
            if (!milestone) {
                throw new Error(`Milestone ${milestoneId} not found`);
            }

            // Get milestone issues
            const milestoneIssues = await this.getMilestoneIssues(milestoneId);
            
            // Calculate progress
            const progress = this.calculateMilestoneProgress(milestoneIssues);
            
            // Update milestone
            await this.updateProjectMilestone(milestoneId, {
                progress_percentage: progress.percentage,
                completed_issues: progress.completed_issues,
                total_issues: progress.total_issues,
                last_updated: new Date()
            });

            // Update Linear issue if exists
            if (milestone.linear_issue_id) {
                const comment = this.formatMilestoneProgressComment(progress);
                await this.linearAPI.addComment(milestone.linear_issue_id, comment);
            }

            return progress;

        } catch (error) {
            throw new Error(`Failed to update milestone progress: ${error.message}`);
        }
    }

    /**
     * Calculate milestone progress
     */
    calculateMilestoneProgress(issues) {
        if (issues.length === 0) {
            return {
                percentage: 0,
                completed_issues: 0,
                total_issues: 0,
                in_progress_issues: 0
            };
        }

        let completedIssues = 0;
        let inProgressIssues = 0;

        for (const issue of issues) {
            if (issue.state.type === 'completed') {
                completedIssues++;
            } else if (issue.state.type === 'started') {
                inProgressIssues++;
            }
        }

        return {
            percentage: Math.round((completedIssues / issues.length) * 100),
            completed_issues: completedIssues,
            total_issues: issues.length,
            in_progress_issues: inProgressIssues
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Check if issue has label
     */
    hasLabel(issue, labelName) {
        if (!issue.labels) return false;
        return issue.labels.some(label => 
            label.name.toLowerCase() === labelName.toLowerCase()
        );
    }

    /**
     * Interpolate template string
     */
    interpolateTemplate(template, data) {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return data[key] || match;
        });
    }

    /**
     * Update project description with progress
     */
    updateProjectDescriptionWithProgress(description, progress) {
        const progressSection = `\n\n## 📊 Project Progress\n\n` +
                               `- **Completion**: ${progress.percentage}%\n` +
                               `- **Issues**: ${progress.completed_issues}/${progress.total_issues}\n` +
                               `- **In Progress**: ${progress.in_progress_issues}\n` +
                               `- **Todo**: ${progress.todo_issues}\n` +
                               `- **Last Updated**: ${progress.last_updated}\n`;

        // Remove existing progress section if present
        const progressRegex = /\n\n## 📊 Project Progress\n\n[\s\S]*?(?=\n\n##|\n\n---|\n\n\*|$)/;
        const cleanDescription = description.replace(progressRegex, '');
        
        return cleanDescription + progressSection;
    }

    /**
     * Format milestone description
     */
    formatMilestoneDescription(milestone) {
        let description = `## 🎯 Milestone: ${milestone.name}\n\n`;
        
        if (milestone.description) {
            description += `${milestone.description}\n\n`;
        }
        
        if (milestone.target_date) {
            description += `**Target Date**: ${milestone.target_date}\n`;
        }
        
        description += `**Status**: ${milestone.status}\n`;
        description += `**Created**: ${milestone.created_at}\n\n`;
        description += `---\n*This milestone is managed by Task Master*`;
        
        return description;
    }

    /**
     * Format milestone progress comment
     */
    formatMilestoneProgressComment(progress) {
        const emoji = progress.percentage === 100 ? '🎉' : 
                     progress.percentage >= 75 ? '🟢' :
                     progress.percentage >= 50 ? '🟡' :
                     progress.percentage >= 25 ? '🟠' : '🔴';

        return `${emoji} **Milestone Progress Update**\n\n` +
               `**Completion**: ${progress.percentage}%\n` +
               `**Issues**: ${progress.completed_issues}/${progress.total_issues}\n` +
               `**In Progress**: ${progress.in_progress_issues}\n\n` +
               `_Updated: ${new Date().toISOString()}_`;
    }

    /**
     * Generate milestone ID
     */
    generateMilestoneId() {
        return `milestone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ==================== CACHE MANAGEMENT ====================

    /**
     * Get from cache
     */
    getFromCache(key) {
        const cached = this.projectCache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.projectCache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    /**
     * Set cache
     */
    setCache(key, data) {
        this.projectCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.projectCache.clear();
    }

    // ==================== TIMER MANAGEMENT ====================

    /**
     * Start sync timer
     */
    startSyncTimer() {
        this.syncTimer = setInterval(async () => {
            try {
                await this.bulkUpdateProjectProgress();
            } catch (error) {
                console.error('Project sync timer error:', error);
            }
        }, this.config.projectSyncInterval);
    }

    /**
     * Stop sync timer
     */
    stopSyncTimer() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    // ==================== DATABASE OPERATIONS ====================

    /**
     * Store project assignment
     */
    async storeProjectAssignment(assignment) {
        if (!this.database) return;

        const query = `
            INSERT INTO project_assignments (
                issue_id, project_id, assigned_by, assignment_rule, 
                metadata, assigned_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        const values = [
            assignment.issue_id,
            assignment.project_id,
            assignment.assigned_by,
            assignment.assignment_rule,
            JSON.stringify(assignment.metadata),
            assignment.assigned_at
        ];

        await this.database.query(query, values);
    }

    /**
     * Store project metadata
     */
    async storeProjectMetadata(metadata) {
        if (!this.database) return;

        const query = `
            INSERT INTO project_metadata (
                project_id, template_name, template_data, 
                created_by, created_at
            ) VALUES ($1, $2, $3, $4, $5)
        `;

        const values = [
            metadata.project_id,
            metadata.template_name,
            JSON.stringify(metadata.template_data),
            metadata.created_by,
            metadata.created_at
        ];

        await this.database.query(query, values);
    }

    /**
     * Store project progress
     */
    async storeProjectProgress(progress) {
        if (!this.database) return;

        const query = `
            INSERT INTO project_progress (
                project_id, percentage, total_issues, completed_issues,
                in_progress_issues, todo_issues, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        const values = [
            progress.project_id,
            progress.percentage,
            progress.total_issues,
            progress.completed_issues,
            progress.in_progress_issues,
            progress.todo_issues,
            new Date()
        ];

        await this.database.query(query, values);
    }

    /**
     * Store project milestone
     */
    async storeProjectMilestone(milestone) {
        if (!this.database) return;

        const query = `
            INSERT INTO project_milestones (
                id, project_id, name, description, target_date,
                status, linear_issue_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        const values = [
            milestone.id,
            milestone.project_id,
            milestone.name,
            milestone.description,
            milestone.target_date,
            milestone.status,
            milestone.linear_issue_id,
            milestone.created_at
        ];

        await this.database.query(query, values);
    }

    /**
     * Load assignment rules from database
     */
    async loadAssignmentRules() {
        if (!this.database) return;

        try {
            const query = `
                SELECT * FROM project_assignment_rules 
                WHERE active = true 
                ORDER BY priority ASC
            `;

            const result = await this.database.query(query);
            
            // Merge with default rules
            const dbRules = result.rows.map(row => ({
                name: row.name,
                condition: this.parseRuleCondition(row.condition),
                projectId: row.project_id,
                priority: row.priority
            }));

            this.assignmentRules = [...dbRules, ...this.assignmentRules];

        } catch (error) {
            console.warn('Failed to load assignment rules from database:', error);
        }
    }

    /**
     * Parse rule condition from database
     */
    parseRuleCondition(conditionString) {
        // Simple condition parser - in production, use a proper expression parser
        try {
            return new Function('issue', `return ${conditionString}`);
        } catch (error) {
            console.warn('Failed to parse rule condition:', conditionString);
            return () => false;
        }
    }

    /**
     * Ensure project tables exist
     */
    async ensureProjectTables() {
        if (!this.database) return;

        const createTablesQuery = `
            -- Project assignments
            CREATE TABLE IF NOT EXISTS project_assignments (
                id SERIAL PRIMARY KEY,
                issue_id VARCHAR(255) NOT NULL,
                project_id VARCHAR(255) NOT NULL,
                assigned_by VARCHAR(255) NOT NULL,
                assignment_rule VARCHAR(255),
                metadata JSONB DEFAULT '{}',
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project metadata
            CREATE TABLE IF NOT EXISTS project_metadata (
                id SERIAL PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL,
                template_name VARCHAR(100),
                template_data JSONB DEFAULT '{}',
                created_by VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project progress
            CREATE TABLE IF NOT EXISTS project_progress (
                id SERIAL PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL,
                percentage INTEGER NOT NULL,
                total_issues INTEGER DEFAULT 0,
                completed_issues INTEGER DEFAULT 0,
                in_progress_issues INTEGER DEFAULT 0,
                todo_issues INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project milestones
            CREATE TABLE IF NOT EXISTS project_milestones (
                id VARCHAR(255) PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                target_date DATE,
                status VARCHAR(50) DEFAULT 'active',
                linear_issue_id VARCHAR(255),
                progress_percentage INTEGER DEFAULT 0,
                completed_issues INTEGER DEFAULT 0,
                total_issues INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project assignment rules
            CREATE TABLE IF NOT EXISTS project_assignment_rules (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                condition TEXT NOT NULL,
                project_id VARCHAR(255),
                priority INTEGER DEFAULT 100,
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_project_assignments_issue_id ON project_assignments(issue_id);
            CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON project_assignments(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_progress_project_id ON project_progress(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id ON project_milestones(project_id);
        `;

        await this.database.query(createTablesQuery);
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Get project manager status
     */
    getStatus() {
        return {
            config: {
                auto_assignment: this.config.enableAutoAssignment,
                progress_tracking: this.config.enableProgressTracking,
                milestone_management: this.config.enableMilestoneManagement,
                default_project_id: this.config.defaultProjectId,
                sync_interval: this.config.projectSyncInterval
            },
            assignment_rules: this.assignmentRules.length,
            cache: {
                size: this.projectCache.size,
                timeout: this.cacheTimeout
            },
            timers: {
                sync_active: !!this.syncTimer
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.stopSyncTimer();
        this.clearCache();
    }
}

export default LinearProjectManager;

