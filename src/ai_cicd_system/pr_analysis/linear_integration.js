/**
 * Linear Integration for Task Master PR Analysis
 * 
 * Provides seamless integration with Linear for creating and managing issues
 * related to PR analysis results and task management workflows.
 */

/**
 * Linear Integration Manager
 */
export class LinearIntegration {
    constructor(config = {}) {
        this.config = {
            api_key: config.api_key || process.env.LINEAR_API_KEY,
            team_id: config.team_id || process.env.LINEAR_TEAM_ID,
            base_url: config.base_url || 'https://api.linear.app/graphql',
            create_sub_issues: config.create_sub_issues !== false,
            link_to_tasks: config.link_to_tasks !== false,
            auto_assign: config.auto_assign || false,
            ...config
        };
        
        if (!this.config.api_key) {
            throw new Error('Linear API key is required');
        }
        
        if (!this.config.team_id) {
            throw new Error('Linear team ID is required');
        }
        
        this.issueCache = new Map();
        this.labelCache = new Map();
        this.stateCache = new Map();
    }

    /**
     * Create main analysis issue
     */
    async createAnalysisIssue(options = {}) {
        const {
            title,
            description,
            task_id,
            requirement_id,
            pr_url,
            analysis_results
        } = options;
        
        try {
            // Get or create labels
            const labels = await this.getOrCreateLabels([
                'pr-analysis',
                'task-management',
                `grade-${analysis_results.grade.toLowerCase()}`,
                `ai-editor-${analysis_results.ai_editor}`
            ]);
            
            // Get appropriate state
            const state = await this.getStateForAnalysis(analysis_results);
            
            // Create issue
            const issue = await this.createIssue({
                title: title,
                description: description,
                teamId: this.config.team_id,
                labelIds: labels.map(l => l.id),
                stateId: state.id,
                priority: this.calculatePriority(analysis_results),
                metadata: {
                    task_id,
                    requirement_id,
                    pr_url,
                    analysis_id: analysis_results.analysis_id,
                    overall_score: analysis_results.overall_score,
                    grade: analysis_results.grade
                }
            });
            
            // Cache the issue
            this.issueCache.set(analysis_results.analysis_id, issue);
            
            return issue;
            
        } catch (error) {
            console.error('Failed to create Linear analysis issue:', error);
            throw new Error(`Linear issue creation failed: ${error.message}`);
        }
    }

    /**
     * Create issue from analysis result
     */
    async createIssueFromAnalysis(options = {}) {
        const {
            analysis_issue,
            parent_issue_id,
            task_id,
            pr_url
        } = options;
        
        try {
            // Get or create labels based on issue type and severity
            const labels = await this.getOrCreateLabels([
                'pr-analysis',
                `severity-${analysis_issue.severity}`,
                `type-${analysis_issue.type}`,
                analysis_issue.module
            ]);
            
            // Get appropriate state based on severity
            const state = await this.getStateForIssue(analysis_issue);
            
            // Create detailed description
            const description = this.formatIssueDescription(analysis_issue, {
                task_id,
                pr_url,
                parent_issue_id
            });
            
            // Create issue
            const issue = await this.createIssue({
                title: `${analysis_issue.severity.toUpperCase()}: ${analysis_issue.title}`,
                description: description,
                teamId: this.config.team_id,
                labelIds: labels.map(l => l.id),
                stateId: state.id,
                priority: this.severityToPriority(analysis_issue.severity),
                parentId: parent_issue_id,
                metadata: {
                    analysis_issue_id: analysis_issue.id,
                    task_id,
                    pr_url,
                    severity: analysis_issue.severity,
                    type: analysis_issue.type,
                    module: analysis_issue.module,
                    auto_fixable: analysis_issue.auto_fixable
                }
            });
            
            return issue;
            
        } catch (error) {
            console.error('Failed to create Linear issue from analysis:', error);
            throw new Error(`Linear issue creation failed: ${error.message}`);
        }
    }

    /**
     * Update issue with analysis progress
     */
    async updateIssueProgress(issueId, progress = {}) {
        try {
            const updateData = {
                description: progress.description,
                stateId: progress.state_id,
                priority: progress.priority
            };
            
            // Add progress comment
            if (progress.comment) {
                await this.addComment(issueId, progress.comment);
            }
            
            // Update issue
            const updatedIssue = await this.updateIssue(issueId, updateData);
            
            return updatedIssue;
            
        } catch (error) {
            console.error('Failed to update Linear issue progress:', error);
            throw new Error(`Linear issue update failed: ${error.message}`);
        }
    }

    /**
     * Link issue to task
     */
    async linkIssueToTask(issueId, taskId, relationshipType = 'related') {
        try {
            // Add task reference to issue description
            const issue = await this.getIssue(issueId);
            const updatedDescription = this.addTaskReference(issue.description, taskId, relationshipType);
            
            await this.updateIssue(issueId, {
                description: updatedDescription
            });
            
            // Add comment about task linkage
            await this.addComment(issueId, `🔗 Linked to Task: ${taskId} (${relationshipType})`);
            
            return { success: true, task_id: taskId, relationship: relationshipType };
            
        } catch (error) {
            console.error('Failed to link issue to task:', error);
            throw new Error(`Task linking failed: ${error.message}`);
        }
    }

    /**
     * Create or get labels
     */
    async getOrCreateLabels(labelNames) {
        const labels = [];
        
        for (const labelName of labelNames) {
            // Check cache first
            if (this.labelCache.has(labelName)) {
                labels.push(this.labelCache.get(labelName));
                continue;
            }
            
            try {
                // Try to find existing label
                let label = await this.findLabel(labelName);
                
                // Create if not found
                if (!label) {
                    label = await this.createLabel({
                        name: labelName,
                        color: this.getLabelColor(labelName),
                        teamId: this.config.team_id
                    });
                }
                
                // Cache the label
                this.labelCache.set(labelName, label);
                labels.push(label);
                
            } catch (error) {
                console.warn(`Failed to create/get label ${labelName}:`, error.message);
            }
        }
        
        return labels;
    }

    /**
     * Get appropriate state for analysis
     */
    async getStateForAnalysis(analysisResults) {
        const score = analysisResults.overall_score;
        const issueCount = analysisResults.summary.total_issues_count;
        
        let stateName;
        if (score >= 90 && issueCount === 0) {
            stateName = 'Done';
        } else if (score >= 70) {
            stateName = 'In Progress';
        } else {
            stateName = 'Todo';
        }
        
        return await this.getOrCreateState(stateName);
    }

    /**
     * Get appropriate state for individual issue
     */
    async getStateForIssue(analysisIssue) {
        let stateName;
        
        switch (analysisIssue.severity) {
            case 'critical':
                stateName = 'Todo'; // Immediate attention needed
                break;
            case 'high':
                stateName = 'Todo';
                break;
            case 'medium':
                stateName = 'Backlog';
                break;
            case 'low':
                stateName = 'Backlog';
                break;
            default:
                stateName = 'Backlog';
        }
        
        return await this.getOrCreateState(stateName);
    }

    /**
     * Get or create state
     */
    async getOrCreateState(stateName) {
        // Check cache first
        if (this.stateCache.has(stateName)) {
            return this.stateCache.get(stateName);
        }
        
        try {
            // Try to find existing state
            let state = await this.findState(stateName);
            
            // Use default state if not found
            if (!state) {
                state = await this.getDefaultState();
            }
            
            // Cache the state
            this.stateCache.set(stateName, state);
            return state;
            
        } catch (error) {
            console.warn(`Failed to get state ${stateName}:`, error.message);
            return await this.getDefaultState();
        }
    }

    /**
     * Calculate priority from analysis results
     */
    calculatePriority(analysisResults) {
        const score = analysisResults.overall_score;
        const criticalIssues = analysisResults.summary.critical_issues_count;
        const highIssues = analysisResults.summary.high_issues_count;
        
        if (criticalIssues > 0) return 1; // Urgent
        if (highIssues > 0 || score < 60) return 2; // High
        if (score < 80) return 3; // Medium
        return 4; // Low
    }

    /**
     * Convert severity to priority
     */
    severityToPriority(severity) {
        switch (severity) {
            case 'critical': return 1; // Urgent
            case 'high': return 2; // High
            case 'medium': return 3; // Medium
            case 'low': return 4; // Low
            default: return 3; // Medium
        }
    }

    /**
     * Format issue description
     */
    formatIssueDescription(analysisIssue, context = {}) {
        let description = `# ${analysisIssue.title}\n\n`;
        
        description += `**Severity:** ${analysisIssue.severity.toUpperCase()}\n`;
        description += `**Type:** ${analysisIssue.type}\n`;
        description += `**Module:** ${analysisIssue.module}\n`;
        description += `**Auto-fixable:** ${analysisIssue.auto_fixable ? 'Yes' : 'No'}\n\n`;
        
        if (context.task_id) {
            description += `**Task ID:** ${context.task_id}\n`;
        }
        
        if (context.pr_url) {
            description += `**PR URL:** ${context.pr_url}\n`;
        }
        
        description += `\n## Description\n\n${analysisIssue.description}\n\n`;
        
        if (analysisIssue.file) {
            description += `## Location\n\n`;
            description += `**File:** ${analysisIssue.file}\n`;
            if (analysisIssue.line) {
                description += `**Line:** ${analysisIssue.line}\n`;
            }
            description += `\n`;
        }
        
        if (analysisIssue.suggestion) {
            description += `## Suggested Fix\n\n${analysisIssue.suggestion}\n\n`;
        }
        
        description += `## Analysis Details\n\n`;
        description += `- **Detected by:** ${analysisIssue.module}\n`;
        description += `- **Timestamp:** ${analysisIssue.timestamp}\n`;
        
        if (context.parent_issue_id) {
            description += `- **Parent Issue:** ${context.parent_issue_id}\n`;
        }
        
        return description;
    }

    /**
     * Add task reference to description
     */
    addTaskReference(description, taskId, relationshipType) {
        const reference = `\n\n---\n\n**Task Reference:** ${taskId} (${relationshipType})\n`;
        return description + reference;
    }

    /**
     * Get label color based on name
     */
    getLabelColor(labelName) {
        const colorMap = {
            'pr-analysis': '#3B82F6', // Blue
            'task-management': '#10B981', // Green
            'severity-critical': '#EF4444', // Red
            'severity-high': '#F59E0B', // Orange
            'severity-medium': '#F59E0B', // Yellow
            'severity-low': '#6B7280', // Gray
            'grade-a': '#10B981', // Green
            'grade-b': '#3B82F6', // Blue
            'grade-c': '#F59E0B', // Orange
            'grade-d': '#EF4444', // Red
            'grade-f': '#7C2D12', // Dark Red
            'ai-editor-cursor': '#8B5CF6', // Purple
            'ai-editor-lovable': '#EC4899', // Pink
            'ai-editor-windsurf': '#06B6D4', // Cyan
            'ai-editor-roo': '#84CC16' // Lime
        };
        
        return colorMap[labelName] || '#6B7280'; // Default gray
    }

    /**
     * Mock Linear API methods (in real implementation, these would make actual GraphQL calls)
     */
    async createIssue(issueData) {
        // Mock implementation - would make actual Linear GraphQL mutation
        const issue = {
            id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: issueData.title,
            description: issueData.description,
            teamId: issueData.teamId,
            labelIds: issueData.labelIds || [],
            stateId: issueData.stateId,
            priority: issueData.priority,
            parentId: issueData.parentId,
            url: `https://linear.app/team/issue/${issueData.title.toLowerCase().replace(/\s+/g, '-')}`,
            createdAt: new Date().toISOString(),
            metadata: issueData.metadata || {}
        };
        
        console.log('Created Linear issue:', issue.title);
        return issue;
    }

    async updateIssue(issueId, updateData) {
        // Mock implementation - would make actual Linear GraphQL mutation
        console.log(`Updated Linear issue ${issueId}:`, updateData);
        return { id: issueId, ...updateData, updatedAt: new Date().toISOString() };
    }

    async getIssue(issueId) {
        // Mock implementation - would make actual Linear GraphQL query
        return {
            id: issueId,
            title: 'Mock Issue',
            description: 'Mock description',
            createdAt: new Date().toISOString()
        };
    }

    async addComment(issueId, comment) {
        // Mock implementation - would make actual Linear GraphQL mutation
        const commentObj = {
            id: `comment_${Date.now()}`,
            body: comment,
            issueId: issueId,
            createdAt: new Date().toISOString()
        };
        
        console.log(`Added comment to issue ${issueId}:`, comment);
        return commentObj;
    }

    async findLabel(labelName) {
        // Mock implementation - would make actual Linear GraphQL query
        const mockLabels = {
            'pr-analysis': { id: 'label_pr_analysis', name: 'pr-analysis', color: '#3B82F6' },
            'task-management': { id: 'label_task_mgmt', name: 'task-management', color: '#10B981' }
        };
        
        return mockLabels[labelName] || null;
    }

    async createLabel(labelData) {
        // Mock implementation - would make actual Linear GraphQL mutation
        const label = {
            id: `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: labelData.name,
            color: labelData.color,
            teamId: labelData.teamId,
            createdAt: new Date().toISOString()
        };
        
        console.log('Created Linear label:', label.name);
        return label;
    }

    async findState(stateName) {
        // Mock implementation - would make actual Linear GraphQL query
        const mockStates = {
            'Todo': { id: 'state_todo', name: 'Todo', type: 'unstarted' },
            'In Progress': { id: 'state_progress', name: 'In Progress', type: 'started' },
            'Done': { id: 'state_done', name: 'Done', type: 'completed' },
            'Backlog': { id: 'state_backlog', name: 'Backlog', type: 'unstarted' }
        };
        
        return mockStates[stateName] || null;
    }

    async getDefaultState() {
        // Mock implementation - would return team's default state
        return {
            id: 'state_default',
            name: 'Todo',
            type: 'unstarted'
        };
    }

    /**
     * Get integration health
     */
    async getHealth() {
        try {
            // Test API connectivity
            const testQuery = await this.testConnection();
            
            return {
                status: testQuery.success ? 'healthy' : 'error',
                api_key_configured: !!this.config.api_key,
                team_id_configured: !!this.config.team_id,
                base_url: this.config.base_url,
                features: {
                    create_issues: true,
                    create_sub_issues: this.config.create_sub_issues,
                    link_to_tasks: this.config.link_to_tasks,
                    auto_assign: this.config.auto_assign
                },
                cache_stats: {
                    issues_cached: this.issueCache.size,
                    labels_cached: this.labelCache.size,
                    states_cached: this.stateCache.size
                }
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                api_key_configured: !!this.config.api_key,
                team_id_configured: !!this.config.team_id
            };
        }
    }

    /**
     * Test Linear API connection
     */
    async testConnection() {
        try {
            // Mock connection test - would make actual Linear API call
            if (!this.config.api_key || !this.config.team_id) {
                throw new Error('Missing API key or team ID');
            }
            
            return { success: true, timestamp: new Date().toISOString() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get integration statistics
     */
    getStatistics() {
        return {
            issues_created: this.issueCache.size,
            labels_managed: this.labelCache.size,
            states_used: this.stateCache.size,
            configuration: {
                team_id: this.config.team_id,
                create_sub_issues: this.config.create_sub_issues,
                link_to_tasks: this.config.link_to_tasks,
                auto_assign: this.config.auto_assign
            }
        };
    }
}

export default LinearIntegration;

