/**
 * Task Master PR Analysis System - Main Entry Point
 * 
 * Comprehensive PR analysis system specifically designed for claude-task-master
 * with AI editor integration and task management workflow support.
 */

import { TaskMasterPRAnalysisEngine } from './engine.js';
import { TaskMasterPRAnalyzer } from './analyzer.js';
import { AIEditorIntegration } from './ai_editor_integration.js';
import { LinearIntegration } from './linear_integration.js';
import { AgentAPIIntegration } from './agentapi_integration.js';

/**
 * Create a complete PR analysis system for Task Master
 */
export async function createTaskMasterPRAnalysisSystem(config = {}) {
    const systemConfig = {
        // Analysis engine configuration
        analysis: {
            enabled_modules: config.analysis?.enabled_modules || ['all'],
            timeout_ms: config.analysis?.timeout_ms || 300000,
            max_concurrent_analyses: config.analysis?.max_concurrent_analyses || 10,
            ai_editor_integration: config.analysis?.ai_editor_integration !== false,
            task_workflow_integration: config.analysis?.task_workflow_integration !== false
        },
        
        // AI editor configuration
        ai_editor: {
            editor: config.ai_editor?.editor || 'cursor',
            mcp_integration: config.ai_editor?.mcp_integration !== false,
            real_time_feedback: config.ai_editor?.real_time_feedback !== false,
            workspace_analysis: config.ai_editor?.workspace_analysis !== false,
            config: config.ai_editor?.config || {}
        },
        
        // Integration configurations
        integrations: {
            linear: {
                enabled: config.integrations?.linear?.enabled !== false,
                api_key: config.integrations?.linear?.api_key || process.env.LINEAR_API_KEY,
                team_id: config.integrations?.linear?.team_id || process.env.LINEAR_TEAM_ID,
                create_sub_issues: config.integrations?.linear?.create_sub_issues !== false,
                link_to_tasks: config.integrations?.linear?.link_to_tasks !== false
            },
            agentapi: {
                enabled: config.integrations?.agentapi?.enabled !== false,
                base_url: config.integrations?.agentapi?.base_url || process.env.AGENTAPI_BASE_URL,
                api_key: config.integrations?.agentapi?.api_key || process.env.AGENTAPI_KEY,
                auto_fix_enabled: config.integrations?.agentapi?.auto_fix_enabled !== false,
                task_aware_fixes: config.integrations?.agentapi?.task_aware_fixes !== false
            }
        },
        
        // Task management configuration
        task_management: {
            validate_completion: config.task_management?.validate_completion !== false,
            check_dependencies: config.task_management?.check_dependencies !== false,
            update_task_status: config.task_management?.update_task_status !== false,
            link_analysis_to_tasks: config.task_management?.link_analysis_to_tasks !== false
        }
    };
    
    // Create analysis engine
    const analysisEngine = new TaskMasterPRAnalysisEngine({
        analysis_modules: systemConfig.analysis.enabled_modules,
        timeout_ms: systemConfig.analysis.timeout_ms,
        ai_editor_integration: systemConfig.analysis.ai_editor_integration,
        task_workflow_integration: systemConfig.analysis.task_workflow_integration
    });
    
    // Create AI editor integration
    const aiEditorIntegration = new AIEditorIntegration({
        editor: systemConfig.ai_editor.editor,
        mcp_integration: systemConfig.ai_editor.mcp_integration,
        real_time_feedback: systemConfig.ai_editor.real_time_feedback,
        workspace_analysis: systemConfig.ai_editor.workspace_analysis,
        config: systemConfig.ai_editor.config
    });
    
    // Create integrations
    const integrations = {};
    
    if (systemConfig.integrations.linear.enabled && systemConfig.integrations.linear.api_key) {
        integrations.linear = new LinearIntegration({
            api_key: systemConfig.integrations.linear.api_key,
            team_id: systemConfig.integrations.linear.team_id,
            create_sub_issues: systemConfig.integrations.linear.create_sub_issues,
            link_to_tasks: systemConfig.integrations.linear.link_to_tasks
        });
    }
    
    if (systemConfig.integrations.agentapi.enabled && systemConfig.integrations.agentapi.api_key) {
        integrations.agentapi = new AgentAPIIntegration({
            base_url: systemConfig.integrations.agentapi.base_url,
            api_key: systemConfig.integrations.agentapi.api_key,
            auto_fix_enabled: systemConfig.integrations.agentapi.auto_fix_enabled,
            task_aware_fixes: systemConfig.integrations.agentapi.task_aware_fixes
        });
    }
    
    // Create main analyzer
    const analyzer = new TaskMasterPRAnalyzer({
        ai_editor: systemConfig.ai_editor.editor,
        ai_editor_config: systemConfig.ai_editor.config,
        integration_config: {
            linear_api_key: systemConfig.integrations.linear.api_key,
            linear_team_id: systemConfig.integrations.linear.team_id,
            agentapi_url: systemConfig.integrations.agentapi.base_url,
            agentapi_key: systemConfig.integrations.agentapi.api_key
        },
        analysis_config: {
            enabled_modules: systemConfig.analysis.enabled_modules,
            timeout_ms: systemConfig.analysis.timeout_ms,
            create_linear_issues: systemConfig.integrations.linear.enabled,
            auto_fix_enabled: systemConfig.integrations.agentapi.enabled,
            task_workflow_integration: systemConfig.analysis.task_workflow_integration
        }
    });
    
    // Create system object
    const system = {
        config: systemConfig,
        engine: analysisEngine,
        analyzer: analyzer,
        ai_editor: aiEditorIntegration,
        integrations: integrations,
        
        // Main analysis method
        async analyzePR(prContext, taskContext = {}, options = {}) {
            return await analyzer.analyzePR(prContext, {
                ...options,
                task_context: taskContext
            });
        },
        
        // Task-specific methods
        async validateTaskCompletion(taskId, prContext) {
            const taskContext = await this.getTaskContext(taskId);
            return await analyzer.validateTaskCompletion({
                task: taskContext,
                pr_changes: prContext.files || [],
                acceptance_criteria: taskContext.acceptance_criteria || []
            });
        },
        
        async validateTaskDependencies(taskId, prContext) {
            const taskContext = await this.getTaskContext(taskId);
            return await analyzer.validateTaskDependencies({
                task_id: taskId,
                pr_changes: prContext.files || [],
                dependent_tasks: taskContext.dependencies || []
            });
        },
        
        // AI editor methods
        async getAIEditorContext() {
            return await aiEditorIntegration.getEditorContext();
        },
        
        async updateAIEditor(analysisResults, prContext, taskContext) {
            return await aiEditorIntegration.updateWithAnalysis({
                analysis_results: analysisResults,
                pr_context: prContext,
                task_context: taskContext
            });
        },
        
        // Integration methods
        async createLinearIssues(analysisResults, prContext, taskContext) {
            if (!integrations.linear) {
                throw new Error('Linear integration not configured');
            }
            
            return await integrations.linear.createAnalysisIssue({
                title: `PR Analysis: ${prContext.title || prContext.pr_url}`,
                description: this.generateLinearDescription(analysisResults, prContext, taskContext),
                task_id: taskContext.task_id,
                requirement_id: taskContext.requirement_id,
                pr_url: prContext.pr_url,
                analysis_results: analysisResults
            });
        },
        
        async deployAutoFixAgents(analysisResults, prContext, taskContext) {
            if (!integrations.agentapi) {
                throw new Error('AgentAPI integration not configured');
            }
            
            const fixableIssues = this.getFixableIssues(analysisResults.issues);
            
            return await integrations.agentapi.deployBatchFixAgents(
                fixableIssues,
                prContext,
                taskContext,
                analysisResults
            );
        },
        
        // Utility methods
        async getTaskContext(taskId) {
            // Mock task context retrieval - would integrate with actual task management system
            return {
                task_id: taskId,
                title: `Task ${taskId}`,
                description: 'Mock task description',
                acceptance_criteria: [
                    'Implement feature',
                    'Add tests',
                    'Update documentation'
                ],
                dependencies: [],
                status: 'in_progress'
            };
        },
        
        getFixableIssues(issues) {
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || [])
            ];
            
            return allIssues.filter(issue => issue.auto_fixable);
        },
        
        generateLinearDescription(analysisResults, prContext, taskContext) {
            let description = `# PR Analysis Results\n\n`;
            description += `**Overall Score:** ${analysisResults.overall_score.toFixed(1)}% (Grade: ${analysisResults.grade})\n`;
            description += `**Task Completion:** ${analysisResults.task_completion.percentage.toFixed(1)}%\n`;
            description += `**AI Editor:** ${analysisResults.ai_editor}\n\n`;
            
            if (taskContext.task_id) {
                description += `**Task ID:** ${taskContext.task_id}\n`;
            }
            
            description += `**PR URL:** ${prContext.pr_url}\n\n`;
            
            const totalIssues = analysisResults.summary.total_issues_count;
            if (totalIssues > 0) {
                description += `## Issues Found (${totalIssues})\n\n`;
                description += `- Critical: ${analysisResults.summary.critical_issues_count}\n`;
                description += `- High: ${analysisResults.summary.high_issues_count}\n`;
                description += `- Medium: ${analysisResults.issues.medium?.length || 0}\n`;
                description += `- Low: ${analysisResults.issues.low?.length || 0}\n\n`;
            }
            
            return description;
        },
        
        // System health and metrics
        async getSystemHealth() {
            const engineHealth = await analysisEngine.getHealth();
            const aiEditorHealth = await aiEditorIntegration.getHealth();
            
            const integrationHealth = {};
            for (const [name, integration] of Object.entries(integrations)) {
                integrationHealth[name] = await integration.getHealth();
            }
            
            const overallStatus = engineHealth.status === 'healthy' && 
                                aiEditorHealth.status === 'healthy' &&
                                Object.values(integrationHealth).every(h => h.status === 'healthy' || h.status === 'warning')
                                ? 'healthy' : 'warning';
            
            return {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                components: {
                    engine: engineHealth,
                    ai_editor: aiEditorHealth,
                    integrations: integrationHealth
                },
                configuration: {
                    ai_editor: systemConfig.ai_editor.editor,
                    enabled_integrations: Object.keys(integrations),
                    task_workflow_integration: systemConfig.analysis.task_workflow_integration
                }
            };
        },
        
        async getSystemMetrics() {
            const engineMetrics = analysisEngine.getMetrics();
            const analyzerMetrics = analyzer.getMetrics();
            
            const integrationMetrics = {};
            for (const [name, integration] of Object.entries(integrations)) {
                if (integration.getStatistics) {
                    integrationMetrics[name] = integration.getStatistics();
                }
            }
            
            return {
                engine: engineMetrics,
                analyzer: analyzerMetrics,
                integrations: integrationMetrics,
                system: {
                    uptime: process.uptime(),
                    memory_usage: process.memoryUsage(),
                    timestamp: new Date().toISOString()
                }
            };
        },
        
        // Shutdown method
        async shutdown() {
            console.log('Shutting down Task Master PR Analysis System...');
            
            // Clean up active deployments
            if (integrations.agentapi) {
                const activeDeployments = integrations.agentapi.activeDeployments;
                for (const deploymentId of activeDeployments.keys()) {
                    try {
                        await integrations.agentapi.cancelDeployment(deploymentId);
                    } catch (error) {
                        console.warn(`Failed to cancel deployment ${deploymentId}:`, error.message);
                    }
                }
            }
            
            console.log('Task Master PR Analysis System shutdown complete');
        }
    };
    
    return system;
}

/**
 * Quick analysis function for simple use cases
 */
export async function analyzeTaskMasterPR(prUrl, taskId, options = {}) {
    const system = await createTaskMasterPRAnalysisSystem(options.config || {});
    
    const prContext = {
        pr_url: prUrl,
        title: options.title || `PR Analysis for ${prUrl}`,
        files: options.files || [],
        diff: options.diff
    };
    
    const taskContext = {
        task_id: taskId,
        ...options.task_context
    };
    
    return await system.analyzePR(prContext, taskContext, options.analysis_options);
}

/**
 * Create analyzer with default Task Master configuration
 */
export function createTaskMasterAnalyzer(config = {}) {
    return new TaskMasterPRAnalyzer({
        ai_editor: config.ai_editor || 'cursor',
        ai_editor_config: config.ai_editor_config || {},
        integration_config: {
            linear_api_key: config.linear_api_key || process.env.LINEAR_API_KEY,
            linear_team_id: config.linear_team_id || process.env.LINEAR_TEAM_ID,
            agentapi_url: config.agentapi_url || process.env.AGENTAPI_BASE_URL,
            agentapi_key: config.agentapi_key || process.env.AGENTAPI_KEY,
            ...config.integration_config
        },
        analysis_config: {
            enabled_modules: config.enabled_modules || ['all'],
            timeout_ms: config.timeout_ms || 300000,
            create_linear_issues: config.create_linear_issues !== false,
            auto_fix_enabled: config.auto_fix_enabled !== false,
            task_workflow_integration: config.task_workflow_integration !== false,
            ...config.analysis_config
        }
    });
}

// Export all components for advanced usage
export {
    TaskMasterPRAnalysisEngine,
    TaskMasterPRAnalyzer,
    AIEditorIntegration,
    LinearIntegration,
    AgentAPIIntegration
};

// Export configuration helpers
export function createDefaultTaskMasterConfig() {
    return {
        analysis: {
            enabled_modules: ['all'],
            timeout_ms: 300000,
            max_concurrent_analyses: 10,
            ai_editor_integration: true,
            task_workflow_integration: true
        },
        ai_editor: {
            editor: 'cursor',
            mcp_integration: true,
            real_time_feedback: true,
            workspace_analysis: true
        },
        integrations: {
            linear: {
                enabled: true,
                create_sub_issues: true,
                link_to_tasks: true
            },
            agentapi: {
                enabled: true,
                auto_fix_enabled: true,
                task_aware_fixes: true
            }
        },
        task_management: {
            validate_completion: true,
            check_dependencies: true,
            update_task_status: true,
            link_analysis_to_tasks: true
        }
    };
}

export function validateTaskMasterConfig(config) {
    const errors = [];
    
    // Check required AI editor
    if (!config.ai_editor?.editor) {
        errors.push('AI editor must be specified');
    }
    
    const supportedEditors = ['cursor', 'lovable', 'windsurf', 'roo'];
    if (config.ai_editor?.editor && !supportedEditors.includes(config.ai_editor.editor)) {
        errors.push(`Unsupported AI editor: ${config.ai_editor.editor}. Supported: ${supportedEditors.join(', ')}`);
    }
    
    // Check Linear integration
    if (config.integrations?.linear?.enabled) {
        if (!config.integrations.linear.api_key && !process.env.LINEAR_API_KEY) {
            errors.push('Linear API key is required when Linear integration is enabled');
        }
        if (!config.integrations.linear.team_id && !process.env.LINEAR_TEAM_ID) {
            errors.push('Linear team ID is required when Linear integration is enabled');
        }
    }
    
    // Check AgentAPI integration
    if (config.integrations?.agentapi?.enabled) {
        if (!config.integrations.agentapi.api_key && !process.env.AGENTAPI_KEY) {
            errors.push('AgentAPI key is required when AgentAPI integration is enabled');
        }
        if (!config.integrations.agentapi.base_url && !process.env.AGENTAPI_BASE_URL) {
            errors.push('AgentAPI base URL is required when AgentAPI integration is enabled');
        }
    }
    
    // Check analysis configuration
    if (config.analysis?.timeout_ms && config.analysis.timeout_ms < 10000) {
        errors.push('Analysis timeout must be at least 10 seconds');
    }
    
    if (config.analysis?.max_concurrent_analyses && config.analysis.max_concurrent_analyses < 1) {
        errors.push('Max concurrent analyses must be at least 1');
    }
    
    return errors;
}

export default {
    createTaskMasterPRAnalysisSystem,
    analyzeTaskMasterPR,
    createTaskMasterAnalyzer,
    createDefaultTaskMasterConfig,
    validateTaskMasterConfig,
    TaskMasterPRAnalysisEngine,
    TaskMasterPRAnalyzer,
    AIEditorIntegration,
    LinearIntegration,
    AgentAPIIntegration
};

