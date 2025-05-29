/**
 * Enhanced AI CI/CD System with Comprehensive PR Analysis
 * 
 * This file extends the existing AI CI/CD system with the new comprehensive
 * PR analysis capabilities specifically designed for claude-task-master.
 */

import { createAICICDSystem } from './index.js';
import { createTaskMasterPRAnalysisSystem, validateTaskMasterConfig } from './pr_analysis/index.js';

/**
 * Create enhanced AI CI/CD system with PR analysis
 */
export async function createEnhancedAICICDSystem(config = {}) {
    // Validate PR analysis configuration
    if (config.pr_analysis?.enabled) {
        const validationErrors = validateTaskMasterConfig(config.pr_analysis);
        if (validationErrors.length > 0) {
            console.warn('PR Analysis configuration issues:', validationErrors);
        }
    }
    
    // Create base AI CI/CD system
    const baseSystem = await createAICICDSystem(config);
    
    // Create PR analysis system if enabled
    let prAnalysisSystem = null;
    if (config.pr_analysis?.enabled !== false) {
        try {
            prAnalysisSystem = await createTaskMasterPRAnalysisSystem(config.pr_analysis || {});
            console.log('✅ PR Analysis system initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize PR Analysis system:', error.message);
            console.log('📝 Continuing without PR analysis capabilities');
        }
    }
    
    // Enhanced system object
    const enhancedSystem = {
        ...baseSystem,
        
        // PR analysis system
        prAnalysis: prAnalysisSystem,
        
        // Enhanced requirement processing with PR analysis
        async processRequirement(requirement, options = {}) {
            console.log('🔄 Processing requirement with enhanced AI CI/CD system...');
            
            // Process requirement with base system
            const baseResult = await baseSystem.processRequirement(requirement, options);
            
            // Add PR analysis if enabled and PRs were created
            if (prAnalysisSystem && baseResult.codegen_results?.length > 0) {
                console.log('🔬 Running PR analysis on generated PRs...');
                
                const prAnalysisResults = [];
                
                for (const codegenResult of baseResult.codegen_results) {
                    if (codegenResult.status === 'completed' && codegenResult.pr_info) {
                        try {
                            // Find corresponding task
                            const task = baseResult.tasks.find(t => t.id === codegenResult.task_id);
                            
                            // Analyze PR with task context
                            const analysisResult = await prAnalysisSystem.analyzePR(
                                {
                                    pr_url: codegenResult.pr_info.pr_url,
                                    title: `Task ${codegenResult.task_id}: ${task?.title || 'Generated PR'}`,
                                    files: codegenResult.pr_info.files || []
                                },
                                {
                                    task_id: codegenResult.task_id,
                                    requirement_id: baseResult.workflow_id,
                                    title: task?.title,
                                    description: task?.description,
                                    acceptance_criteria: task?.acceptance_criteria,
                                    dependencies: task?.dependencies || []
                                },
                                {
                                    ai_editor: options.ai_editor || 'cursor'
                                }
                            );
                            
                            prAnalysisResults.push({
                                task_id: codegenResult.task_id,
                                pr_url: codegenResult.pr_info.pr_url,
                                analysis: analysisResult,
                                status: 'completed'
                            });
                            
                            console.log(`✅ PR analysis completed for task ${codegenResult.task_id} (Score: ${analysisResult.overall_score.toFixed(1)}%)`);
                            
                        } catch (error) {
                            console.error(`❌ PR analysis failed for task ${codegenResult.task_id}:`, error.message);
                            prAnalysisResults.push({
                                task_id: codegenResult.task_id,
                                pr_url: codegenResult.pr_info?.pr_url,
                                analysis: null,
                                status: 'failed',
                                error: error.message
                            });
                        }
                    }
                }
                
                // Add PR analysis results to base result
                baseResult.pr_analysis_results = prAnalysisResults;
                
                // Calculate overall analysis metrics
                const successfulAnalyses = prAnalysisResults.filter(r => r.status === 'completed');
                if (successfulAnalyses.length > 0) {
                    const avgScore = successfulAnalyses.reduce((sum, r) => sum + r.analysis.overall_score, 0) / successfulAnalyses.length;
                    const totalIssues = successfulAnalyses.reduce((sum, r) => sum + r.analysis.summary.total_issues_count, 0);
                    
                    baseResult.pr_analysis_summary = {
                        total_prs_analyzed: prAnalysisResults.length,
                        successful_analyses: successfulAnalyses.length,
                        failed_analyses: prAnalysisResults.length - successfulAnalyses.length,
                        average_score: avgScore,
                        total_issues_found: totalIssues,
                        analysis_grade: this.calculateOverallGrade(avgScore)
                    };
                    
                    console.log(`📊 PR Analysis Summary: ${successfulAnalyses.length}/${prAnalysisResults.length} PRs analyzed, Average Score: ${avgScore.toFixed(1)}%`);
                }
            }
            
            return baseResult;
        },
        
        // Enhanced task processing with PR analysis
        async processTaskWithPRAnalysis(task, options = {}) {
            if (!prAnalysisSystem) {
                throw new Error('PR Analysis system not available');
            }
            
            console.log(`🔬 Processing task ${task.id} with PR analysis...`);
            
            // Process task with codegen
            const codegenIntegrator = baseSystem.components.get('codegenIntegrator');
            const codegenResult = await codegenIntegrator.processTask(task, options.context || {});
            
            // Analyze generated PR if successful
            if (codegenResult.status === 'completed' && codegenResult.pr_info) {
                const analysisResult = await prAnalysisSystem.analyzePR(
                    {
                        pr_url: codegenResult.pr_info.pr_url,
                        title: `Task ${task.id}: ${task.title}`,
                        files: codegenResult.pr_info.files || []
                    },
                    {
                        task_id: task.id,
                        title: task.title,
                        description: task.description,
                        acceptance_criteria: task.acceptance_criteria,
                        dependencies: task.dependencies || []
                    },
                    {
                        ai_editor: options.ai_editor || 'cursor'
                    }
                );
                
                return {
                    task: task,
                    codegen_result: codegenResult,
                    pr_analysis: analysisResult,
                    status: 'completed'
                };
            }
            
            return {
                task: task,
                codegen_result: codegenResult,
                pr_analysis: null,
                status: codegenResult.status
            };
        },
        
        // AI Editor integration methods
        async getAIEditorContext() {
            if (!prAnalysisSystem) {
                throw new Error('PR Analysis system not available');
            }
            
            return await prAnalysisSystem.getAIEditorContext();
        },
        
        async updateAIEditorWithAnalysis(analysisResults, prContext, taskContext) {
            if (!prAnalysisSystem) {
                throw new Error('PR Analysis system not available');
            }
            
            return await prAnalysisSystem.updateAIEditor(analysisResults, prContext, taskContext);
        },
        
        // Task validation methods
        async validateTaskCompletion(taskId, prUrl) {
            if (!prAnalysisSystem) {
                throw new Error('PR Analysis system not available');
            }
            
            const prContext = { pr_url: prUrl };
            return await prAnalysisSystem.validateTaskCompletion(taskId, prContext);
        },
        
        async validateTaskDependencies(taskId, prUrl) {
            if (!prAnalysisSystem) {
                throw new Error('PR Analysis system not available');
            }
            
            const prContext = { pr_url: prUrl };
            return await prAnalysisSystem.validateTaskDependencies(taskId, prContext);
        },
        
        // Enhanced system health
        async getSystemHealth() {
            const baseHealth = await baseSystem.getSystemHealth();
            
            let prAnalysisHealth = null;
            if (prAnalysisSystem) {
                try {
                    prAnalysisHealth = await prAnalysisSystem.getSystemHealth();
                } catch (error) {
                    prAnalysisHealth = {
                        status: 'error',
                        error: error.message
                    };
                }
            }
            
            const overallStatus = baseHealth.status === 'healthy' && 
                                (!prAnalysisHealth || prAnalysisHealth.status === 'healthy') 
                                ? 'healthy' : 'warning';
            
            return {
                ...baseHealth,
                status: overallStatus,
                pr_analysis: prAnalysisHealth,
                enhanced_features: {
                    pr_analysis_enabled: !!prAnalysisSystem,
                    ai_editor_integration: !!prAnalysisSystem,
                    task_validation: !!prAnalysisSystem,
                    auto_fix_deployment: !!prAnalysisSystem?.integrations?.agentapi
                }
            };
        },
        
        // Enhanced system metrics
        async getSystemMetrics() {
            const baseMetrics = await baseSystem.getSystemMetrics();
            
            let prAnalysisMetrics = null;
            if (prAnalysisSystem) {
                try {
                    prAnalysisMetrics = await prAnalysisSystem.getSystemMetrics();
                } catch (error) {
                    prAnalysisMetrics = {
                        error: error.message
                    };
                }
            }
            
            return {
                ...baseMetrics,
                pr_analysis: prAnalysisMetrics,
                enhanced_system: {
                    total_components: Object.keys(baseSystem.components).length + (prAnalysisSystem ? 1 : 0),
                    pr_analysis_available: !!prAnalysisSystem,
                    integration_count: prAnalysisSystem ? Object.keys(prAnalysisSystem.integrations).length : 0
                }
            };
        },
        
        // Utility methods
        calculateOverallGrade(score) {
            if (score >= 90) return 'A';
            if (score >= 80) return 'B';
            if (score >= 70) return 'C';
            if (score >= 60) return 'D';
            return 'F';
        },
        
        // Enhanced shutdown
        async shutdown() {
            console.log('🔄 Shutting down Enhanced AI CI/CD System...');
            
            // Shutdown PR analysis system first
            if (prAnalysisSystem) {
                try {
                    await prAnalysisSystem.shutdown();
                    console.log('✅ PR Analysis system shutdown complete');
                } catch (error) {
                    console.error('❌ PR Analysis system shutdown error:', error.message);
                }
            }
            
            // Shutdown base system
            await baseSystem.shutdown();
            
            console.log('✅ Enhanced AI CI/CD System shutdown complete');
        }
    };
    
    return enhancedSystem;
}

/**
 * Process requirement with enhanced system (convenience function)
 */
export async function processRequirementWithPRAnalysis(requirement, config = {}) {
    const system = await createEnhancedAICICDSystem({
        ...config,
        pr_analysis: {
            enabled: true,
            ...config.pr_analysis
        }
    });
    
    try {
        const result = await system.processRequirement(requirement, config.options || {});
        return result;
    } finally {
        await system.shutdown();
    }
}

/**
 * Analyze existing PR with task context
 */
export async function analyzeExistingPR(prUrl, taskId, config = {}) {
    const system = await createEnhancedAICICDSystem({
        pr_analysis: {
            enabled: true,
            ...config.pr_analysis
        }
    });
    
    try {
        if (!system.prAnalysis) {
            throw new Error('PR Analysis system not available');
        }
        
        // Get task context
        const taskContext = await system.getTaskContext(taskId);
        
        // Analyze PR
        const analysisResult = await system.prAnalysis.analyzePR(
            {
                pr_url: prUrl,
                title: `Analysis of ${prUrl}`
            },
            taskContext,
            {
                ai_editor: config.ai_editor || 'cursor'
            }
        );
        
        return analysisResult;
    } finally {
        await system.shutdown();
    }
}

/**
 * Create enhanced system with default configuration
 */
export function createDefaultEnhancedConfig() {
    return {
        // Base AI CI/CD configuration
        mode: 'production',
        database: {
            enable_mock: !process.env.DB_HOST
        },
        codegen: {
            enable_mock: !process.env.CODEGEN_API_KEY
        },
        validation: {
            enable_mock: !process.env.CLAUDE_CODE_API_KEY
        },
        
        // PR Analysis configuration
        pr_analysis: {
            enabled: true,
            analysis: {
                enabled_modules: ['all'],
                timeout_ms: 300000,
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
                    enabled: !!process.env.LINEAR_API_KEY,
                    create_sub_issues: true,
                    link_to_tasks: true
                },
                agentapi: {
                    enabled: !!process.env.AGENTAPI_KEY,
                    auto_fix_enabled: true,
                    task_aware_fixes: true
                }
            }
        }
    };
}

// Export enhanced system as default
export default {
    createEnhancedAICICDSystem,
    processRequirementWithPRAnalysis,
    analyzeExistingPR,
    createDefaultEnhancedConfig
};

