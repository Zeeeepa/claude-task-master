/**
 * Task Master PR Analyzer
 * 
 * Main analyzer class that integrates PR analysis with task management workflows
 * and AI editor environments.
 */

import { TaskMasterPRAnalysisEngine } from './engine.js';
import { AIEditorIntegration } from './ai_editor_integration.js';
import { LinearIntegration } from './linear_integration.js';
import { AgentAPIIntegration } from './agentapi_integration.js';

/**
 * Task-aware PR analyzer for claude-task-master
 */
export class TaskMasterPRAnalyzer {
    constructor(config = {}) {
        this.config = {
            // Task context configuration
            task_context: {
                task_id: null,
                requirement_id: null,
                dependencies: [],
                ...config.task_context
            },
            
            // AI editor configuration
            ai_editor: config.ai_editor || 'cursor',
            ai_editor_config: config.ai_editor_config || {},
            
            // Integration configurations
            integration_config: {
                linear_api_key: process.env.LINEAR_API_KEY,
                linear_team_id: process.env.LINEAR_TEAM_ID,
                agentapi_url: process.env.AGENTAPI_BASE_URL || 'http://localhost:8000',
                agentapi_key: process.env.AGENTAPI_KEY,
                ...config.integration_config
            },
            
            // Analysis configuration
            analysis_config: {
                enabled_modules: ['all'],
                timeout_ms: 300000,
                create_linear_issues: true,
                auto_fix_enabled: true,
                task_workflow_integration: true,
                ...config.analysis_config
            }
        };
        
        this.initializeComponents();
    }

    /**
     * Initialize analyzer components
     */
    initializeComponents() {
        // Initialize PR analysis engine
        this.analysisEngine = new TaskMasterPRAnalysisEngine({
            analysis_modules: this.config.analysis_config.enabled_modules,
            timeout_ms: this.config.analysis_config.timeout_ms,
            ai_editor_integration: true,
            task_workflow_integration: this.config.analysis_config.task_workflow_integration
        });
        
        // Initialize AI editor integration
        this.aiEditorIntegration = new AIEditorIntegration({
            editor: this.config.ai_editor,
            config: this.config.ai_editor_config
        });
        
        // Initialize Linear integration if enabled
        if (this.config.integration_config.linear_api_key) {
            this.linearIntegration = new LinearIntegration({
                api_key: this.config.integration_config.linear_api_key,
                team_id: this.config.integration_config.linear_team_id
            });
        }
        
        // Initialize AgentAPI integration if enabled
        if (this.config.integration_config.agentapi_key) {
            this.agentapiIntegration = new AgentAPIIntegration({
                base_url: this.config.integration_config.agentapi_url,
                api_key: this.config.integration_config.agentapi_key
            });
        }
    }

    /**
     * Analyze PR with full task context
     */
    async analyzePR(prContext, options = {}) {
        try {
            // Enhance PR context with task information
            const enhancedPRContext = await this.enhancePRContext(prContext);
            
            // Get task context
            const taskContext = await this.getTaskContext(options.task_context);
            
            // Get AI editor context
            const aiEditorContext = await this.getAIEditorContext();
            
            // Run comprehensive analysis
            const analysisResults = await this.analysisEngine.analyzePR(
                enhancedPRContext,
                taskContext,
                {
                    ai_editor: this.config.ai_editor,
                    ai_editor_context: aiEditorContext,
                    ...options
                }
            );
            
            // Process results with integrations
            const processedResults = await this.processAnalysisResults(
                analysisResults,
                enhancedPRContext,
                taskContext
            );
            
            return processedResults;
            
        } catch (error) {
            console.error('PR analysis failed:', error);
            throw new Error(`PR analysis failed: ${error.message}`);
        }
    }

    /**
     * Enhance PR context with additional information
     */
    async enhancePRContext(prContext) {
        const enhanced = {
            ...prContext,
            timestamp: new Date().toISOString(),
            analyzer_version: '1.0.0'
        };
        
        // Add file analysis if not present
        if (!enhanced.files && enhanced.pr_url) {
            enhanced.files = await this.fetchPRFiles(enhanced.pr_url);
        }
        
        // Add diff information if available
        if (enhanced.pr_url && !enhanced.diff) {
            enhanced.diff = await this.fetchPRDiff(enhanced.pr_url);
        }
        
        return enhanced;
    }

    /**
     * Get comprehensive task context
     */
    async getTaskContext(providedContext = {}) {
        const taskContext = {
            ...this.config.task_context,
            ...providedContext
        };
        
        // Fetch additional task information if task_id is provided
        if (taskContext.task_id) {
            try {
                const taskDetails = await this.fetchTaskDetails(taskContext.task_id);
                Object.assign(taskContext, taskDetails);
            } catch (error) {
                console.warn('Could not fetch task details:', error.message);
            }
        }
        
        // Fetch requirement information if requirement_id is provided
        if (taskContext.requirement_id) {
            try {
                const requirementDetails = await this.fetchRequirementDetails(taskContext.requirement_id);
                taskContext.requirement = requirementDetails;
            } catch (error) {
                console.warn('Could not fetch requirement details:', error.message);
            }
        }
        
        // Fetch dependency information
        if (taskContext.dependencies && taskContext.dependencies.length > 0) {
            try {
                const dependencyDetails = await this.fetchDependencyDetails(taskContext.dependencies);
                taskContext.dependency_details = dependencyDetails;
            } catch (error) {
                console.warn('Could not fetch dependency details:', error.message);
            }
        }
        
        return taskContext;
    }

    /**
     * Get AI editor context
     */
    async getAIEditorContext() {
        try {
            return await this.aiEditorIntegration.getEditorContext();
        } catch (error) {
            console.warn('Could not get AI editor context:', error.message);
            return {
                editor: this.config.ai_editor,
                available: false,
                error: error.message
            };
        }
    }

    /**
     * Process analysis results with integrations
     */
    async processAnalysisResults(analysisResults, prContext, taskContext) {
        const processedResults = {
            ...analysisResults,
            integrations: {}
        };
        
        // Create Linear issues if enabled
        if (this.config.analysis_config.create_linear_issues && this.linearIntegration) {
            try {
                const linearResults = await this.createLinearIssues(
                    analysisResults,
                    prContext,
                    taskContext
                );
                processedResults.integrations.linear = linearResults;
            } catch (error) {
                console.error('Linear integration failed:', error);
                processedResults.integrations.linear = { error: error.message };
            }
        }
        
        // Deploy auto-fix agents if enabled
        if (this.config.analysis_config.auto_fix_enabled && this.agentapiIntegration) {
            try {
                const autoFixResults = await this.deployAutoFixAgents(
                    analysisResults,
                    prContext,
                    taskContext
                );
                processedResults.integrations.agentapi = autoFixResults;
            } catch (error) {
                console.error('AgentAPI integration failed:', error);
                processedResults.integrations.agentapi = { error: error.message };
            }
        }
        
        // Update AI editor with results
        try {
            const editorResults = await this.updateAIEditor(
                analysisResults,
                prContext,
                taskContext
            );
            processedResults.integrations.ai_editor = editorResults;
        } catch (error) {
            console.error('AI editor integration failed:', error);
            processedResults.integrations.ai_editor = { error: error.message };
        }
        
        return processedResults;
    }

    /**
     * Create Linear issues for analysis results
     */
    async createLinearIssues(analysisResults, prContext, taskContext) {
        if (!this.linearIntegration) {
            throw new Error('Linear integration not configured');
        }
        
        const issues = [];
        
        // Create main analysis issue
        const mainIssue = await this.linearIntegration.createAnalysisIssue({
            title: `PR Analysis: ${prContext.title || prContext.pr_url}`,
            description: this.generateLinearDescription(analysisResults, prContext, taskContext),
            task_id: taskContext.task_id,
            requirement_id: taskContext.requirement_id,
            pr_url: prContext.pr_url,
            analysis_results: analysisResults
        });
        
        issues.push(mainIssue);
        
        // Create issues for critical and high severity problems
        const criticalIssues = analysisResults.issues.critical || [];
        const highIssues = analysisResults.issues.high || [];
        
        for (const issue of [...criticalIssues, ...highIssues]) {
            const linearIssue = await this.linearIntegration.createIssueFromAnalysis({
                analysis_issue: issue,
                parent_issue_id: mainIssue.id,
                task_id: taskContext.task_id,
                pr_url: prContext.pr_url
            });
            
            issues.push(linearIssue);
        }
        
        return {
            main_issue: mainIssue,
            sub_issues: issues.slice(1),
            total_issues: issues.length
        };
    }

    /**
     * Deploy auto-fix agents for fixable issues
     */
    async deployAutoFixAgents(analysisResults, prContext, taskContext) {
        if (!this.agentapiIntegration) {
            throw new Error('AgentAPI integration not configured');
        }
        
        const deployments = [];
        
        // Find auto-fixable issues
        const allIssues = [
            ...(analysisResults.issues.critical || []),
            ...(analysisResults.issues.high || []),
            ...(analysisResults.issues.medium || [])
        ];
        
        const fixableIssues = allIssues.filter(issue => issue.auto_fixable);
        
        for (const issue of fixableIssues) {
            try {
                const deployment = await this.agentapiIntegration.deployFixAgent({
                    issue: issue,
                    pr_context: prContext,
                    task_context: taskContext,
                    analysis_context: analysisResults
                });
                
                deployments.push(deployment);
            } catch (error) {
                console.error(`Failed to deploy fix agent for issue ${issue.title}:`, error);
                deployments.push({
                    issue_id: issue.id,
                    error: error.message,
                    status: 'failed'
                });
            }
        }
        
        return {
            deployments: deployments,
            total_deployments: deployments.length,
            successful_deployments: deployments.filter(d => d.status !== 'failed').length
        };
    }

    /**
     * Update AI editor with analysis results
     */
    async updateAIEditor(analysisResults, prContext, taskContext) {
        try {
            return await this.aiEditorIntegration.updateWithAnalysis({
                analysis_results: analysisResults,
                pr_context: prContext,
                task_context: taskContext
            });
        } catch (error) {
            console.error('Failed to update AI editor:', error);
            return { error: error.message };
        }
    }

    /**
     * Generate Linear issue description
     */
    generateLinearDescription(analysisResults, prContext, taskContext) {
        const { overall_score, grade, issues, task_completion, summary } = analysisResults;
        
        let description = `# PR Analysis Results\n\n`;
        description += `**Overall Score:** ${overall_score.toFixed(1)}% (Grade: ${grade})\n`;
        description += `**Task Completion:** ${task_completion.percentage.toFixed(1)}%\n`;
        description += `**AI Editor:** ${this.config.ai_editor}\n\n`;
        
        if (taskContext.task_id) {
            description += `**Task ID:** ${taskContext.task_id}\n`;
        }
        
        if (taskContext.requirement_id) {
            description += `**Requirement ID:** ${taskContext.requirement_id}\n`;
        }
        
        description += `**PR URL:** ${prContext.pr_url}\n\n`;
        
        // Add issues summary
        const totalIssues = summary.total_issues_count;
        if (totalIssues > 0) {
            description += `## Issues Found (${totalIssues})\n\n`;
            description += `- Critical: ${summary.critical_issues_count}\n`;
            description += `- High: ${summary.high_issues_count}\n`;
            description += `- Medium: ${issues.medium?.length || 0}\n`;
            description += `- Low: ${issues.low?.length || 0}\n\n`;
        }
        
        // Add task completion details
        if (task_completion.missing_requirements?.length > 0) {
            description += `## Missing Requirements\n\n`;
            task_completion.missing_requirements.forEach(req => {
                description += `- ${req}\n`;
            });
            description += `\n`;
        }
        
        // Add recommendations
        if (analysisResults.recommendations?.length > 0) {
            description += `## Top Recommendations\n\n`;
            analysisResults.recommendations.slice(0, 5).forEach(rec => {
                description += `- **${rec.title}**: ${rec.description}\n`;
            });
        }
        
        return description;
    }

    /**
     * Fetch PR files (mock implementation)
     */
    async fetchPRFiles(prUrl) {
        // Mock implementation - would fetch actual PR files from GitHub API
        return [
            { filename: 'src/example.js', status: 'modified' },
            { filename: 'tests/example.test.js', status: 'added' }
        ];
    }

    /**
     * Fetch PR diff (mock implementation)
     */
    async fetchPRDiff(prUrl) {
        // Mock implementation - would fetch actual diff from GitHub API
        return 'Mock diff content';
    }

    /**
     * Fetch task details (mock implementation)
     */
    async fetchTaskDetails(taskId) {
        // Mock implementation - would fetch from task management system
        return {
            title: `Task ${taskId}`,
            description: 'Mock task description',
            acceptance_criteria: [
                'Implement feature X',
                'Add tests for feature X',
                'Update documentation'
            ],
            status: 'in_progress',
            assignee: 'developer',
            created_at: new Date().toISOString()
        };
    }

    /**
     * Fetch requirement details (mock implementation)
     */
    async fetchRequirementDetails(requirementId) {
        // Mock implementation - would fetch from requirements system
        return {
            id: requirementId,
            title: `Requirement ${requirementId}`,
            description: 'Mock requirement description',
            priority: 'high',
            category: 'feature'
        };
    }

    /**
     * Fetch dependency details (mock implementation)
     */
    async fetchDependencyDetails(dependencies) {
        // Mock implementation - would fetch dependency information
        return dependencies.map(dep => ({
            id: dep,
            title: `Dependency ${dep}`,
            status: 'completed',
            type: 'task'
        }));
    }

    /**
     * Validate task dependencies
     */
    async validateTaskDependencies(options = {}) {
        const { task_id, pr_changes, dependent_tasks } = options;
        
        // Mock dependency validation
        const issues = [];
        const validDependencies = dependent_tasks?.filter(() => Math.random() > 0.1) || [];
        const invalidDependencies = dependent_tasks?.filter(() => Math.random() <= 0.1) || [];
        
        if (invalidDependencies.length > 0) {
            issues.push({
                type: 'dependency_conflict',
                severity: 'high',
                title: 'Dependency Conflicts Detected',
                description: `Changes may conflict with dependent tasks: ${invalidDependencies.join(', ')}`,
                affected_tasks: invalidDependencies
            });
        }
        
        return {
            valid: invalidDependencies.length === 0,
            issues: issues,
            valid_dependencies: validDependencies,
            invalid_dependencies: invalidDependencies,
            total_dependencies: dependent_tasks?.length || 0
        };
    }

    /**
     * Validate task completion
     */
    async validateTaskCompletion(options = {}) {
        const { task, pr_changes, acceptance_criteria } = options;
        
        // Mock completion validation
        const totalCriteria = acceptance_criteria?.length || 3;
        const metCriteria = Math.floor(totalCriteria * (0.7 + Math.random() * 0.3));
        const completionPercentage = (metCriteria / totalCriteria) * 100;
        
        const missingRequirements = acceptance_criteria?.slice(metCriteria) || [];
        
        return {
            completion_percentage: completionPercentage,
            status: completionPercentage >= 90 ? 'complete' : 'incomplete',
            met_criteria: metCriteria,
            total_criteria: totalCriteria,
            missing_requirements: missingRequirements,
            recommendations: missingRequirements.length > 0 ? [
                'Complete remaining acceptance criteria',
                'Add comprehensive tests',
                'Update documentation'
            ] : []
        };
    }

    /**
     * Get analyzer metrics
     */
    getMetrics() {
        return {
            engine_metrics: this.analysisEngine.getMetrics(),
            ai_editor: this.config.ai_editor,
            integrations: {
                linear: !!this.linearIntegration,
                agentapi: !!this.agentapiIntegration,
                ai_editor: !!this.aiEditorIntegration
            },
            configuration: {
                task_workflow_integration: this.config.analysis_config.task_workflow_integration,
                auto_fix_enabled: this.config.analysis_config.auto_fix_enabled,
                create_linear_issues: this.config.analysis_config.create_linear_issues
            }
        };
    }

    /**
     * Get analyzer health
     */
    async getHealth() {
        const engineHealth = await this.analysisEngine.getHealth();
        
        const integrationHealth = {
            linear: this.linearIntegration ? await this.linearIntegration.getHealth() : { status: 'disabled' },
            agentapi: this.agentapiIntegration ? await this.agentapiIntegration.getHealth() : { status: 'disabled' },
            ai_editor: await this.aiEditorIntegration.getHealth()
        };
        
        const overallStatus = engineHealth.status === 'healthy' && 
                            Object.values(integrationHealth).every(h => h.status === 'healthy' || h.status === 'disabled') 
                            ? 'healthy' : 'warning';
        
        return {
            status: overallStatus,
            engine: engineHealth,
            integrations: integrationHealth,
            last_analysis: new Date().toISOString()
        };
    }
}

export default TaskMasterPRAnalyzer;

