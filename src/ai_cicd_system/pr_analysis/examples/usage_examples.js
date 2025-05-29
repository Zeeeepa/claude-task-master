/**
 * Task Master PR Analysis - Usage Examples
 * 
 * Comprehensive examples showing how to use the PR analysis system
 * with claude-task-master and various AI editors.
 */

import { 
    createTaskMasterPRAnalysisSystem,
    analyzeTaskMasterPR,
    createTaskMasterAnalyzer,
    createDefaultTaskMasterConfig
} from '../index.js';

import { createEnhancedAICICDSystem } from '../enhanced_index.js';

/**
 * Example 1: Basic PR Analysis
 */
export async function basicPRAnalysisExample() {
    console.log('🔬 Example 1: Basic PR Analysis');
    
    try {
        // Create analyzer with default configuration
        const analyzer = createTaskMasterAnalyzer({
            ai_editor: 'cursor',
            linear_api_key: process.env.LINEAR_API_KEY,
            agentapi_key: process.env.AGENTAPI_KEY
        });
        
        // Analyze a PR with task context
        const analysisResult = await analyzer.analyzePR(
            {
                pr_url: 'https://github.com/org/repo/pull/123',
                title: 'Implement user authentication system',
                files: [
                    { filename: 'src/auth/login.js', status: 'added' },
                    { filename: 'src/auth/middleware.js', status: 'modified' },
                    { filename: 'tests/auth.test.js', status: 'added' }
                ]
            },
            {
                task_id: 'task_001',
                requirement_id: 'req_auth_system',
                title: 'User Authentication System',
                description: 'Implement secure user authentication with JWT tokens',
                acceptance_criteria: [
                    'User can log in with email/password',
                    'JWT tokens are generated on successful login',
                    'Protected routes require valid tokens',
                    'Comprehensive tests are included'
                ],
                dependencies: ['task_002'] // Database setup task
            }
        );
        
        console.log('📊 Analysis Results:');
        console.log(`- Overall Score: ${analysisResult.overall_score.toFixed(1)}% (Grade: ${analysisResult.grade})`);
        console.log(`- Task Completion: ${analysisResult.task_completion.percentage.toFixed(1)}%`);
        console.log(`- Issues Found: ${analysisResult.summary.total_issues_count}`);
        console.log(`- AI Editor: ${analysisResult.ai_editor}`);
        
        if (analysisResult.integrations.linear) {
            console.log(`- Linear Issues Created: ${analysisResult.integrations.linear.total_issues}`);
        }
        
        if (analysisResult.integrations.agentapi) {
            console.log(`- Auto-fix Agents Deployed: ${analysisResult.integrations.agentapi.total_deployments}`);
        }
        
        return analysisResult;
        
    } catch (error) {
        console.error('❌ Basic PR analysis failed:', error.message);
        throw error;
    }
}

/**
 * Example 2: Full System Integration
 */
export async function fullSystemIntegrationExample() {
    console.log('🚀 Example 2: Full System Integration');
    
    try {
        // Create complete PR analysis system
        const system = await createTaskMasterPRAnalysisSystem({
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
                    enabled: true,
                    api_key: process.env.LINEAR_API_KEY,
                    team_id: process.env.LINEAR_TEAM_ID,
                    create_sub_issues: true,
                    link_to_tasks: true
                },
                agentapi: {
                    enabled: true,
                    base_url: process.env.AGENTAPI_BASE_URL,
                    api_key: process.env.AGENTAPI_KEY,
                    auto_fix_enabled: true,
                    task_aware_fixes: true
                }
            }
        });
        
        // Get AI editor context
        const editorContext = await system.getAIEditorContext();
        console.log(`📝 AI Editor Context: ${editorContext.editor} (Available: ${editorContext.available})`);
        
        // Analyze PR with full context
        const analysisResult = await system.analyzePR(
            {
                pr_url: 'https://github.com/org/repo/pull/456',
                title: 'Add task dependency validation',
                files: [
                    { filename: 'src/tasks/validator.js', status: 'added' },
                    { filename: 'src/tasks/manager.js', status: 'modified' }
                ]
            },
            {
                task_id: 'task_003',
                title: 'Task Dependency Validation',
                acceptance_criteria: [
                    'Validate task dependencies before execution',
                    'Prevent circular dependencies',
                    'Provide clear error messages'
                ]
            }
        );
        
        // Validate task completion
        const completionValidation = await system.validateTaskCompletion('task_003', {
            pr_url: 'https://github.com/org/repo/pull/456'
        });
        
        console.log('✅ Task Completion Validation:');
        console.log(`- Completion: ${completionValidation.completion_percentage.toFixed(1)}%`);
        console.log(`- Status: ${completionValidation.status}`);
        
        // Check system health
        const health = await system.getSystemHealth();
        console.log(`🏥 System Health: ${health.status}`);
        
        return {
            analysis: analysisResult,
            completion: completionValidation,
            health: health
        };
        
    } catch (error) {
        console.error('❌ Full system integration failed:', error.message);
        throw error;
    }
}

/**
 * Example 3: AI Editor Specific Integration
 */
export async function aiEditorIntegrationExample() {
    console.log('🤖 Example 3: AI Editor Integration');
    
    const editors = ['cursor', 'lovable', 'windsurf', 'roo'];
    const results = {};
    
    for (const editor of editors) {
        try {
            console.log(`\n📝 Testing ${editor.toUpperCase()} integration...`);
            
            const analyzer = createTaskMasterAnalyzer({
                ai_editor: editor,
                ai_editor_config: {
                    mcp_integration: editor === 'cursor',
                    real_time_feedback: true,
                    workspace_analysis: true
                }
            });
            
            // Get editor context
            const editorContext = await analyzer.aiEditorIntegration.getEditorContext();
            console.log(`- Editor: ${editorContext.editor}`);
            console.log(`- Available: ${editorContext.available}`);
            
            // Check compatibility
            const compatibility = await analyzer.aiEditorIntegration.checkCompatibility();
            console.log(`- Compatible: ${compatibility.compatible}`);
            console.log(`- Features: ${compatibility.features.length}`);
            
            // Analyze PR with editor-specific context
            const analysisResult = await analyzer.analyzePR(
                {
                    pr_url: `https://github.com/org/repo/pull/${editor}-test`,
                    title: `${editor} integration test`,
                    files: [{ filename: 'src/test.js', status: 'modified' }]
                },
                {
                    task_id: `task_${editor}`,
                    title: `${editor} Integration Task`
                }
            );
            
            results[editor] = {
                context: editorContext,
                compatibility: compatibility,
                analysis_score: analysisResult.overall_score,
                ai_editor_compatibility: analysisResult.ai_editor_compatibility
            };
            
            console.log(`✅ ${editor} integration successful (Score: ${analysisResult.overall_score.toFixed(1)}%)`);
            
        } catch (error) {
            console.error(`❌ ${editor} integration failed:`, error.message);
            results[editor] = { error: error.message };
        }
    }
    
    return results;
}

/**
 * Example 4: Enhanced AI CI/CD System
 */
export async function enhancedAICICDExample() {
    console.log('🔧 Example 4: Enhanced AI CI/CD System');
    
    try {
        // Create enhanced system with PR analysis
        const system = await createEnhancedAICICDSystem({
            mode: 'development',
            pr_analysis: {
                enabled: true,
                ai_editor: {
                    editor: 'cursor',
                    mcp_integration: true
                },
                integrations: {
                    linear: {
                        enabled: !!process.env.LINEAR_API_KEY
                    },
                    agentapi: {
                        enabled: !!process.env.AGENTAPI_KEY
                    }
                }
            }
        });
        
        // Process requirement with PR analysis
        const requirement = `
            Implement a comprehensive task management system with the following features:
            1. Create and manage tasks with dependencies
            2. Validate task completion criteria
            3. Integrate with AI editors for seamless development
            4. Provide real-time progress tracking
            5. Support automated testing and deployment
        `;
        
        console.log('🔄 Processing requirement with enhanced system...');
        const result = await system.processRequirement(requirement, {
            ai_editor: 'cursor',
            enable_pr_analysis: true
        });
        
        console.log('📊 Enhanced Processing Results:');
        console.log(`- Tasks Generated: ${result.tasks.length}`);
        console.log(`- PRs Created: ${result.codegen_results.length}`);
        console.log(`- Validation Results: ${result.validation_results.length}`);
        
        if (result.pr_analysis_results) {
            console.log(`- PRs Analyzed: ${result.pr_analysis_results.length}`);
            console.log(`- Average Analysis Score: ${result.pr_analysis_summary.average_score.toFixed(1)}%`);
            console.log(`- Total Issues Found: ${result.pr_analysis_summary.total_issues_found}`);
        }
        
        // Get system health
        const health = await system.getSystemHealth();
        console.log(`🏥 Enhanced System Health: ${health.status}`);
        console.log(`- PR Analysis Enabled: ${health.enhanced_features.pr_analysis_enabled}`);
        console.log(`- AI Editor Integration: ${health.enhanced_features.ai_editor_integration}`);
        
        await system.shutdown();
        return result;
        
    } catch (error) {
        console.error('❌ Enhanced AI CI/CD example failed:', error.message);
        throw error;
    }
}

/**
 * Example 5: Task Dependency Validation
 */
export async function taskDependencyValidationExample() {
    console.log('🔗 Example 5: Task Dependency Validation');
    
    try {
        const analyzer = createTaskMasterAnalyzer();
        
        // Validate dependencies for a task
        const dependencyValidation = await analyzer.validateTaskDependencies({
            task_id: 'task_005',
            pr_changes: [
                { filename: 'src/api/users.js', status: 'modified' },
                { filename: 'src/database/migrations/add_users.sql', status: 'added' }
            ],
            dependent_tasks: ['task_001', 'task_002', 'task_003']
        });
        
        console.log('🔍 Dependency Validation Results:');
        console.log(`- Valid: ${dependencyValidation.valid}`);
        console.log(`- Total Dependencies: ${dependencyValidation.total_dependencies}`);
        console.log(`- Valid Dependencies: ${dependencyValidation.valid_dependencies.length}`);
        console.log(`- Invalid Dependencies: ${dependencyValidation.invalid_dependencies.length}`);
        
        if (dependencyValidation.issues.length > 0) {
            console.log('⚠️ Dependency Issues:');
            dependencyValidation.issues.forEach(issue => {
                console.log(`  - ${issue.title}: ${issue.description}`);
            });
        }
        
        return dependencyValidation;
        
    } catch (error) {
        console.error('❌ Dependency validation failed:', error.message);
        throw error;
    }
}

/**
 * Example 6: Auto-fix Agent Deployment
 */
export async function autoFixAgentExample() {
    console.log('🤖 Example 6: Auto-fix Agent Deployment');
    
    try {
        const system = await createTaskMasterPRAnalysisSystem({
            integrations: {
                agentapi: {
                    enabled: true,
                    base_url: process.env.AGENTAPI_BASE_URL || 'http://localhost:8000',
                    api_key: process.env.AGENTAPI_KEY || 'mock-key',
                    auto_fix_enabled: true,
                    task_aware_fixes: true
                }
            }
        });
        
        // Analyze PR to find fixable issues
        const analysisResult = await system.analyzePR(
            {
                pr_url: 'https://github.com/org/repo/pull/789',
                title: 'Fix security vulnerabilities',
                files: [
                    { filename: 'src/auth/validator.js', status: 'modified' },
                    { filename: 'src/api/routes.js', status: 'modified' }
                ]
            },
            {
                task_id: 'task_security',
                title: 'Security Vulnerability Fixes',
                acceptance_criteria: [
                    'Fix SQL injection vulnerabilities',
                    'Implement proper input validation',
                    'Add rate limiting to API endpoints'
                ]
            }
        );
        
        // Deploy auto-fix agents for critical and high severity issues
        if (system.integrations.agentapi) {
            const fixableIssues = [
                ...(analysisResult.issues.critical || []),
                ...(analysisResult.issues.high || [])
            ].filter(issue => issue.auto_fixable);
            
            console.log(`🔧 Deploying auto-fix agents for ${fixableIssues.length} fixable issues...`);
            
            const deploymentResults = await system.deployAutoFixAgents(
                analysisResult,
                { pr_url: 'https://github.com/org/repo/pull/789' },
                { task_id: 'task_security' }
            );
            
            console.log('🚀 Auto-fix Deployment Results:');
            console.log(`- Total Deployments: ${deploymentResults.total_deployments}`);
            console.log(`- Successful Deployments: ${deploymentResults.successful_deployments}`);
            console.log(`- Failed Deployments: ${deploymentResults.failed_deployments}`);
            
            // Monitor deployment progress
            for (const deployment of deploymentResults.deployments) {
                if (deployment.status !== 'failed') {
                    console.log(`📊 Monitoring deployment ${deployment.id}...`);
                    
                    // Simulate monitoring (in real implementation, this would be handled automatically)
                    setTimeout(async () => {
                        try {
                            const status = await system.integrations.agentapi.getDeploymentStatus(deployment.id);
                            console.log(`✅ Deployment ${deployment.id} status: ${status.status}`);
                        } catch (error) {
                            console.error(`❌ Failed to get deployment status:`, error.message);
                        }
                    }, 5000);
                }
            }
            
            return deploymentResults;
        }
        
    } catch (error) {
        console.error('❌ Auto-fix agent example failed:', error.message);
        throw error;
    }
}

/**
 * Example 7: Configuration and Validation
 */
export async function configurationExample() {
    console.log('⚙️ Example 7: Configuration and Validation');
    
    try {
        // Create default configuration
        const defaultConfig = createDefaultTaskMasterConfig();
        console.log('📋 Default Configuration Created');
        
        // Validate configuration
        const { validateTaskMasterConfig } = await import('../index.js');
        const validationErrors = validateTaskMasterConfig(defaultConfig);
        
        if (validationErrors.length === 0) {
            console.log('✅ Configuration is valid');
        } else {
            console.log('⚠️ Configuration issues:');
            validationErrors.forEach(error => console.log(`  - ${error}`));
        }
        
        // Test different configurations
        const configurations = [
            {
                name: 'Cursor with Full Integration',
                config: {
                    ai_editor: { editor: 'cursor', mcp_integration: true },
                    integrations: {
                        linear: { enabled: true },
                        agentapi: { enabled: true }
                    }
                }
            },
            {
                name: 'Lovable with Limited Integration',
                config: {
                    ai_editor: { editor: 'lovable', mcp_integration: false },
                    integrations: {
                        linear: { enabled: false },
                        agentapi: { enabled: false }
                    }
                }
            },
            {
                name: 'Development Mode',
                config: {
                    analysis: { enabled_modules: ['task-completion-validation', 'code-quality-assessment'] },
                    ai_editor: { editor: 'cursor' },
                    integrations: {
                        linear: { enabled: false },
                        agentapi: { enabled: false }
                    }
                }
            }
        ];
        
        for (const { name, config } of configurations) {
            console.log(`\n🧪 Testing configuration: ${name}`);
            
            const errors = validateTaskMasterConfig(config);
            if (errors.length === 0) {
                console.log('  ✅ Valid configuration');
                
                try {
                    const system = await createTaskMasterPRAnalysisSystem(config);
                    const health = await system.getSystemHealth();
                    console.log(`  🏥 System health: ${health.status}`);
                } catch (error) {
                    console.log(`  ⚠️ System creation warning: ${error.message}`);
                }
            } else {
                console.log('  ❌ Configuration errors:');
                errors.forEach(error => console.log(`    - ${error}`));
            }
        }
        
        return { defaultConfig, validationErrors };
        
    } catch (error) {
        console.error('❌ Configuration example failed:', error.message);
        throw error;
    }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🚀 Running All Task Master PR Analysis Examples\n');
    
    const results = {};
    
    try {
        results.basic = await basicPRAnalysisExample();
        console.log('\n' + '='.repeat(60) + '\n');
        
        results.fullSystem = await fullSystemIntegrationExample();
        console.log('\n' + '='.repeat(60) + '\n');
        
        results.aiEditor = await aiEditorIntegrationExample();
        console.log('\n' + '='.repeat(60) + '\n');
        
        results.enhanced = await enhancedAICICDExample();
        console.log('\n' + '='.repeat(60) + '\n');
        
        results.dependencies = await taskDependencyValidationExample();
        console.log('\n' + '='.repeat(60) + '\n');
        
        results.autoFix = await autoFixAgentExample();
        console.log('\n' + '='.repeat(60) + '\n');
        
        results.configuration = await configurationExample();
        
        console.log('\n🎉 All examples completed successfully!');
        return results;
        
    } catch (error) {
        console.error('\n❌ Example execution failed:', error.message);
        throw error;
    }
}

// Export all examples
export default {
    basicPRAnalysisExample,
    fullSystemIntegrationExample,
    aiEditorIntegrationExample,
    enhancedAICICDExample,
    taskDependencyValidationExample,
    autoFixAgentExample,
    configurationExample,
    runAllExamples
};

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const exampleName = process.argv[2];
    
    if (exampleName && typeof examples[exampleName] === 'function') {
        console.log(`🚀 Running example: ${exampleName}`);
        examples[exampleName]().catch(console.error);
    } else {
        console.log('🚀 Running all examples...');
        runAllExamples().catch(console.error);
    }
}

