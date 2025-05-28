/**
 * Workflow Engine Usage Examples
 * Demonstrates how to use the advanced workflow orchestration system
 */

import { WorkflowEngine } from '../workflows/workflow_engine.js';
import { WORKFLOW_CONFIG } from '../config/workflow_config.js';

/**
 * Example 1: Basic PR Processing Workflow
 */
export async function basicPRProcessingExample() {
    console.log('🚀 Starting Basic PR Processing Example...');
    
    const workflowEngine = new WorkflowEngine(WORKFLOW_CONFIG);
    
    try {
        const context = {
            pr_id: '123',
            repository: 'company/main-app',
            branch: 'feature/user-authentication',
            author: 'developer@company.com',
            files_changed: ['src/auth.js', 'tests/auth.test.js'],
            lines_added: 150,
            lines_removed: 20
        };

        console.log('📋 Executing PR processing workflow...');
        const result = await workflowEngine.executeWorkflow('pr_processing', context);
        
        console.log('✅ Workflow completed successfully!');
        console.log('📊 Results:', {
            executionId: result.executionId,
            status: result.status,
            duration: result.duration,
            stepsCompleted: Object.keys(result.result.stepResults).length
        });
        
        return result;
        
    } catch (error) {
        console.error('❌ Workflow failed:', error.message);
        throw error;
    } finally {
        await workflowEngine.destroy();
    }
}

/**
 * Example 2: Hotfix Deployment with Monitoring
 */
export async function hotfixDeploymentExample() {
    console.log('🔥 Starting Hotfix Deployment Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        enableMetrics: true
    });
    
    // Set up event listeners for monitoring
    workflowEngine.on('workflow_started', (data) => {
        console.log(`🎬 Workflow started: ${data.workflowId} (${data.executionId})`);
    });
    
    workflowEngine.on('step_execution_started', (data) => {
        console.log(`⚡ Step started: ${data.stepId}`);
    });
    
    workflowEngine.on('step_execution_completed', (data) => {
        console.log(`✅ Step completed: ${data.stepId}`);
    });
    
    workflowEngine.on('workflow_completed', (data) => {
        console.log(`🎉 Workflow completed: ${data.workflowId} in ${data.duration}ms`);
    });

    try {
        const context = {
            hotfix_branch: 'hotfix/critical-security-fix',
            severity: 'critical',
            affected_systems: ['authentication', 'payment'],
            rollback_plan: 'automatic',
            notification_channels: ['slack', 'email', 'sms']
        };

        const result = await workflowEngine.executeWorkflow('hotfix_deployment', context);
        
        console.log('🚀 Hotfix deployed successfully!');
        console.log('📈 Metrics:', workflowEngine.getMetrics());
        
        return result;
        
    } finally {
        await workflowEngine.destroy();
    }
}

/**
 * Example 3: Parallel Workflow Execution
 */
export async function parallelWorkflowExample() {
    console.log('⚡ Starting Parallel Workflow Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        maxConcurrentWorkflows: 5
    });

    try {
        const workflows = [
            { id: 'pr_processing', context: { pr_id: '101', repository: 'app1' } },
            { id: 'pr_processing', context: { pr_id: '102', repository: 'app2' } },
            { id: 'feature_integration', context: { feature: 'new-ui', target: 'develop' } },
            { id: 'hotfix_deployment', context: { hotfix_branch: 'hotfix/bug-123' } }
        ];

        console.log(`🔄 Executing ${workflows.length} workflows in parallel...`);
        
        const promises = workflows.map((workflow, index) => 
            workflowEngine.executeWorkflow(workflow.id, {
                ...workflow.context,
                batch_id: `parallel_batch_${Date.now()}`,
                workflow_index: index
            })
        );

        const results = await Promise.all(promises);
        
        console.log('🎯 All parallel workflows completed!');
        console.log('📊 Summary:', {
            totalWorkflows: results.length,
            successfulWorkflows: results.filter(r => r.status === 'completed').length,
            averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length
        });
        
        return results;
        
    } finally {
        await workflowEngine.destroy();
    }
}

/**
 * Example 4: Workflow with Pause and Resume
 */
export async function pauseResumeExample() {
    console.log('⏸️ Starting Pause/Resume Example...');
    
    const workflowEngine = new WorkflowEngine(WORKFLOW_CONFIG);

    try {
        const context = {
            feature_branch: 'feature/complex-integration',
            target_branch: 'develop',
            requires_manual_review: true
        };

        // Start the workflow
        const workflowPromise = workflowEngine.executeWorkflow('feature_integration', context);
        
        // Give it time to start
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get the execution ID
        const activeWorkflows = workflowEngine.getActiveWorkflows();
        if (activeWorkflows.length > 0) {
            const executionId = activeWorkflows[0].executionId;
            
            console.log('⏸️ Pausing workflow for manual review...');
            await workflowEngine.pauseWorkflow(executionId, 'manual_review_required');
            
            // Simulate manual review time
            console.log('👀 Performing manual review...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('▶️ Resuming workflow after review...');
            await workflowEngine.resumeWorkflow(executionId);
        }

        const result = await workflowPromise;
        
        console.log('✅ Workflow completed with pause/resume!');
        return result;
        
    } finally {
        await workflowEngine.destroy();
    }
}

/**
 * Example 5: Error Handling and Recovery
 */
export async function errorHandlingExample() {
    console.log('🛠️ Starting Error Handling Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        retryPolicy: {
            maxRetries: 3,
            retryDelay: 1000,
            backoffMultiplier: 2
        }
    });

    // Set up error event listeners
    workflowEngine.on('step_failed', (data) => {
        console.log(`❌ Step failed: ${data.stepId} - ${data.error.message}`);
    });
    
    workflowEngine.on('step_retry', (data) => {
        console.log(`🔄 Retrying step: ${data.stepId} (attempt ${data.attempt}/${data.maxRetries})`);
    });
    
    workflowEngine.on('workflow_failed', (data) => {
        console.log(`💥 Workflow failed: ${data.workflowId} - ${data.error.message}`);
    });

    try {
        const context = {
            pr_id: '999',
            repository: 'test/error-prone-app',
            simulate_failures: true // This would be handled by mock agents
        };

        const result = await workflowEngine.executeWorkflow('pr_processing', context);
        
        console.log('✅ Workflow completed despite errors!');
        return result;
        
    } catch (error) {
        console.log('❌ Workflow ultimately failed:', error.message);
        
        // Show metrics even on failure
        const metrics = workflowEngine.getMetrics();
        console.log('📊 Final metrics:', metrics);
        
        throw error;
    } finally {
        await workflowEngine.destroy();
    }
}

/**
 * Example 6: Custom Workflow Definition
 */
export async function customWorkflowExample() {
    console.log('🎨 Starting Custom Workflow Example...');
    
    const workflowEngine = new WorkflowEngine(WORKFLOW_CONFIG);

    // Define a custom workflow
    const customWorkflow = {
        id: 'custom_ci_pipeline',
        name: 'Custom CI Pipeline',
        description: 'A custom CI/CD pipeline for specific project needs',
        version: '1.0.0',
        steps: [
            {
                id: 'lint_code',
                name: 'Lint Code',
                type: 'validation',
                agent: 'aider',
                dependencies: [],
                timeout: 30000,
                retry_count: 2,
                config: {
                    linting_rules: 'strict',
                    auto_fix: true
                }
            },
            {
                id: 'run_unit_tests',
                name: 'Run Unit Tests',
                type: 'testing',
                agent: 'claude-code',
                dependencies: ['lint_code'],
                timeout: 120000,
                retry_count: 1,
                parallel: false,
                config: {
                    test_types: ['unit'],
                    coverage_threshold: 90
                }
            },
            {
                id: 'build_application',
                name: 'Build Application',
                type: 'deployment',
                agent: 'codegen',
                dependencies: ['run_unit_tests'],
                timeout: 180000,
                retry_count: 2,
                config: {
                    build_type: 'production',
                    optimize: true
                }
            },
            {
                id: 'integration_tests',
                name: 'Integration Tests',
                type: 'testing',
                agent: 'claude-code',
                dependencies: ['build_application'],
                timeout: 300000,
                retry_count: 1,
                parallel: true,
                config: {
                    test_types: ['integration', 'api'],
                    test_environment: 'staging'
                }
            },
            {
                id: 'security_scan',
                name: 'Security Scan',
                type: 'security',
                agent: 'goose',
                dependencies: ['build_application'],
                timeout: 240000,
                retry_count: 1,
                parallel: true,
                config: {
                    scan_types: ['vulnerability', 'dependency'],
                    severity_threshold: 'medium'
                }
            },
            {
                id: 'deploy_staging',
                name: 'Deploy to Staging',
                type: 'deployment',
                agent: 'claude-code',
                dependencies: ['integration_tests', 'security_scan'],
                timeout: 180000,
                retry_count: 2,
                config: {
                    environment: 'staging',
                    health_check: true,
                    smoke_tests: true
                }
            }
        ],
        error_handling: {
            strategy: 'retry_with_fallback',
            max_retries: 2,
            fallback_agents: ['aider'],
            escalation_policy: 'team_notify'
        },
        notifications: {
            on_start: true,
            on_complete: true,
            on_failure: true,
            channels: ['slack']
        }
    };

    try {
        // Add custom workflow to definitions (in real implementation, this would be done differently)
        const { WORKFLOW_DEFINITIONS } = await import('../workflows/workflow_definition.js');
        WORKFLOW_DEFINITIONS[customWorkflow.id] = customWorkflow;

        const context = {
            repository: 'company/custom-app',
            branch: 'feature/new-pipeline',
            commit_sha: 'abc123def456',
            author: 'devops@company.com'
        };

        console.log('🔧 Executing custom CI pipeline...');
        const result = await workflowEngine.executeWorkflow('custom_ci_pipeline', context);
        
        console.log('🎉 Custom workflow completed!');
        console.log('📋 Execution plan:', result.result.executionPlan);
        
        return result;
        
    } finally {
        await workflowEngine.destroy();
    }
}

/**
 * Example 7: Workflow Monitoring and Metrics
 */
export async function monitoringExample() {
    console.log('📊 Starting Monitoring Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        enableMetrics: true
    });

    // Set up comprehensive monitoring
    const events = [];
    
    workflowEngine.on('workflow_started', (data) => {
        events.push({ type: 'workflow_started', timestamp: Date.now(), data });
    });
    
    workflowEngine.on('step_execution_started', (data) => {
        events.push({ type: 'step_started', timestamp: Date.now(), data });
    });
    
    workflowEngine.on('step_execution_completed', (data) => {
        events.push({ type: 'step_completed', timestamp: Date.now(), data });
    });
    
    workflowEngine.on('parallel_batch_started', (data) => {
        events.push({ type: 'batch_started', timestamp: Date.now(), data });
    });
    
    workflowEngine.on('workflow_completed', (data) => {
        events.push({ type: 'workflow_completed', timestamp: Date.now(), data });
    });

    // Set up metrics collection
    const metricsHistory = [];
    const metricsInterval = setInterval(() => {
        const metrics = workflowEngine.getMetrics();
        metricsHistory.push({
            timestamp: Date.now(),
            ...metrics
        });
    }, 1000);

    try {
        // Execute multiple workflows for monitoring
        const workflows = [
            { id: 'pr_processing', context: { pr_id: '201' } },
            { id: 'feature_integration', context: { feature: 'monitoring-test' } }
        ];

        for (const workflow of workflows) {
            console.log(`🔄 Executing ${workflow.id}...`);
            await workflowEngine.executeWorkflow(workflow.id, workflow.context);
        }

        clearInterval(metricsInterval);
        
        console.log('📈 Monitoring Results:');
        console.log('🎯 Events captured:', events.length);
        console.log('📊 Metrics snapshots:', metricsHistory.length);
        console.log('⏱️ Final metrics:', workflowEngine.getMetrics());
        
        // Analyze performance
        const workflowEvents = events.filter(e => e.type === 'workflow_completed');
        if (workflowEvents.length > 0) {
            const avgDuration = workflowEvents.reduce((sum, e) => sum + e.data.duration, 0) / workflowEvents.length;
            console.log('⚡ Average workflow duration:', avgDuration + 'ms');
        }
        
        return {
            events,
            metricsHistory,
            finalMetrics: workflowEngine.getMetrics()
        };
        
    } finally {
        clearInterval(metricsInterval);
        await workflowEngine.destroy();
    }
}

/**
 * Example 8: Resource Management and Limits
 */
export async function resourceManagementExample() {
    console.log('🎛️ Starting Resource Management Example...');
    
    const workflowEngine = new WorkflowEngine({
        ...WORKFLOW_CONFIG,
        maxConcurrentWorkflows: 3,
        parallelProcessor: {
            ...WORKFLOW_CONFIG.parallelProcessor,
            maxConcurrentSteps: 2,
            memoryLimit: '1GB',
            cpuLimit: '2 cores'
        }
    });

    // Monitor resource usage
    workflowEngine.on('resource_usage_update', (data) => {
        console.log('💾 Resource usage:', {
            memory: `${data.utilization.memory.toFixed(1)}%`,
            cpu: `${data.utilization.cpu.toFixed(1)}%`,
            activeSteps: data.utilization.activeSteps
        });
    });

    try {
        // Try to execute more workflows than the limit allows
        const workflows = Array.from({ length: 5 }, (_, i) => ({
            id: 'feature_integration',
            context: { 
                feature: `resource-test-${i}`,
                resource_intensive: true
            }
        }));

        console.log('🚀 Attempting to execute workflows beyond resource limits...');
        
        const promises = workflows.map(async (workflow, index) => {
            try {
                const result = await workflowEngine.executeWorkflow(workflow.id, workflow.context);
                console.log(`✅ Workflow ${index} completed`);
                return result;
            } catch (error) {
                console.log(`❌ Workflow ${index} failed: ${error.message}`);
                return { error: error.message, index };
            }
        });

        const results = await Promise.all(promises);
        
        const successful = results.filter(r => !r.error).length;
        const failed = results.filter(r => r.error).length;
        
        console.log('📊 Resource management results:');
        console.log(`✅ Successful workflows: ${successful}`);
        console.log(`❌ Failed workflows: ${failed}`);
        console.log('🎯 Resource limits were enforced correctly!');
        
        return results;
        
    } finally {
        await workflowEngine.destroy();
    }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🎪 Running All Workflow Examples...\n');
    
    const examples = [
        { name: 'Basic PR Processing', fn: basicPRProcessingExample },
        { name: 'Hotfix Deployment', fn: hotfixDeploymentExample },
        { name: 'Parallel Workflows', fn: parallelWorkflowExample },
        { name: 'Pause/Resume', fn: pauseResumeExample },
        { name: 'Error Handling', fn: errorHandlingExample },
        { name: 'Custom Workflow', fn: customWorkflowExample },
        { name: 'Monitoring', fn: monitoringExample },
        { name: 'Resource Management', fn: resourceManagementExample }
    ];

    const results = [];
    
    for (const example of examples) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🎯 Running: ${example.name}`);
        console.log(`${'='.repeat(50)}`);
        
        try {
            const startTime = Date.now();
            const result = await example.fn();
            const duration = Date.now() - startTime;
            
            results.push({
                name: example.name,
                success: true,
                duration,
                result
            });
            
            console.log(`✅ ${example.name} completed in ${duration}ms`);
            
        } catch (error) {
            results.push({
                name: example.name,
                success: false,
                error: error.message
            });
            
            console.log(`❌ ${example.name} failed: ${error.message}`);
        }
        
        // Wait between examples
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n${'='.repeat(50)}`);
    console.log('🎉 All Examples Completed!');
    console.log(`${'='.repeat(50)}`);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ Successful: ${successful}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}`);
    
    if (failed > 0) {
        console.log('\n❌ Failed examples:');
        results.filter(r => !r.success).forEach(r => {
            console.log(`  - ${r.name}: ${r.error}`);
        });
    }
    
    return results;
}

// Export for use in other modules
export default {
    basicPRProcessingExample,
    hotfixDeploymentExample,
    parallelWorkflowExample,
    pauseResumeExample,
    errorHandlingExample,
    customWorkflowExample,
    monitoringExample,
    resourceManagementExample,
    runAllExamples
};

